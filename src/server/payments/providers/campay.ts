import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { InitiateInput, InitiateResult, PaymentProviderAdapter, ProviderStatus, StatusResult, WebhookResult } from "../types";
import { ProviderError } from "../types";

export interface CampayConfig {
  baseUrl: string; // https://demo.campay.net | https://www.campay.net
  /** Permanent access token (preferred). */
  token?: string;
  /** App username/password: used to obtain a 1-hour token when no permanent token is set. */
  username?: string;
  password?: string;
  webhookKey?: string;
  timeoutMs?: number;
}

const STATUS: Record<string, ProviderStatus> = {
  PENDING: "pending",
  SUCCESSFUL: "succeeded",
  FAILED: "failed",
};

interface CampayTransaction {
  reference?: string;
  status?: string;
  amount?: number | string;
  currency?: string;
  operator?: string;
  external_reference?: string | null;
  reason?: string;
}

/** Verifies an HS256 JWT (Campay signs callbacks with the app webhook key). */
export function verifyHs256(jwt: string, key: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const [h, c, sig, ...rest] = jwt.split(".");
  if (!h || !c || !sig || rest.length || !key) return false;
  try {
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8")) as { alg?: string };
    if (header.alg !== "HS256") return false;
    const expected = createHmac("sha256", key).update(`${h}.${c}`).digest();
    const got = Buffer.from(sig, "base64url");
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) return false;
    const claims = JSON.parse(Buffer.from(c, "base64url").toString("utf8")) as { exp?: number };
    return typeof claims.exp !== "number" || claims.exp + 300 >= nowSec;
  } catch {
    return false;
  }
}

/**
 * Campay (https://campay.net): the customer receives the MTN MoMo / Orange Money prompt on their
 * phone and approves with their PIN; the operator is detected from the number.
 * Collect: POST /api/collect/  Status: GET /api/transaction/{reference}/
 * Callback: GET/POST to our webhook with the transaction fields and a JWT "signature" (webhook key).
 */
export class CampayProvider implements PaymentProviderAdapter {
  readonly id = "CAMPAY" as const;
  readonly simulated = false;
  private session: { token: string; expiresAt: number } | null = null;

  constructor(private readonly cfg: CampayConfig) {}

  private async authHeader(): Promise<string> {
    if (this.cfg.token) return `Token ${this.cfg.token}`;
    if (this.session && this.session.expiresAt > Date.now()) return `Token ${this.session.token}`;
    const res = await this.raw<{ token?: string; expires_in?: number }>("POST", "/api/token/", { username: this.cfg.username, password: this.cfg.password }, null);
    if (!res.token) throw new ProviderError("Campay did not return an access token", true);
    this.session = { token: res.token, expiresAt: Date.now() + Math.max(60, (res.expires_in ?? 3600) - 300) * 1000 };
    return `Token ${res.token}`;
  }

  private async raw<T>(method: "GET" | "POST", path: string, body: unknown, auth: string | null): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.cfg.baseUrl}${path}`, {
        method,
        headers: { Accept: "application/json", ...(auth ? { Authorization: auth } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 20_000),
        cache: "no-store",
      });
    } catch (err) {
      throw new ProviderError(`Campay unreachable: ${(err as Error).message}`, true);
    }
    const text = await res.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new ProviderError(`Campay returned non-JSON (HTTP ${res.status})`, res.status >= 500);
    }
    if (!res.ok) {
      const d = data as { message?: string; detail?: string; error_code?: string };
      const msg = d.message ?? d.detail ?? `HTTP ${res.status}`;
      throw new ProviderError(`Campay error: ${msg}${d.error_code ? ` (${d.error_code})` : ""}`, res.status >= 500 || res.status === 429);
    }
    return data as T;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    try {
      return await this.raw<T>(method, path, body, await this.authHeader());
    } catch (err) {
      // A 1-hour token can expire between calls: fetch a new one once.
      if (!this.cfg.token && this.session && err instanceof ProviderError && /HTTP 401|credentials/i.test(err.message)) {
        this.session = null;
        return this.raw<T>(method, path, body, await this.authHeader());
      }
      throw err;
    }
  }

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const from = `237${input.phone.replace(/\D/g, "").replace(/^237/, "")}`; // 2376XXXXXXXX
    const res = await this.request<{ reference?: string; ussd_code?: string; operator?: string }>("POST", "/api/collect/", {
      amount: String(input.amountXaf),
      currency: "XAF",
      from,
      description: input.description.slice(0, 100),
      external_reference: input.reference,
    });
    if (!res.reference) throw new ProviderError("Campay did not return a transaction reference", false);
    const orange = /orange/i.test(res.operator ?? "") || input.channel === "cm.orange";
    const dial = res.ussd_code || (orange ? "#150*50#" : "*126#");
    return {
      providerReference: res.reference,
      status: "pending",
      instructions: `Check your phone and approve the ${orange ? "Orange Money" : "MTN MoMo"} request with your PIN. If no prompt appears, dial ${dial} to approve it.`,
    };
  }

  async fetchStatus(payment: { reference: string; providerReference: string | null }): Promise<StatusResult> {
    if (!payment.providerReference) throw new ProviderError("Missing Campay reference", false);
    const t = await this.request<CampayTransaction>("GET", `/api/transaction/${encodeURIComponent(payment.providerReference)}/`);
    const raw = String(t.status ?? "UNKNOWN").toUpperCase();
    const amount = t.amount === undefined || t.amount === null || t.amount === "" ? null : Number(t.amount);
    return {
      status: STATUS[raw] ?? "pending",
      providerReference: t.reference ?? payment.providerReference,
      amountXaf: amount !== null && Number.isFinite(amount) ? amount : null,
      currency: t.currency ?? "XAF",
      merchantReference: t.external_reference ?? null,
      rawStatus: raw,
      failureReason: raw === "FAILED" ? "The payment was declined, cancelled or timed out at the operator." : undefined,
    };
  }

  /**
   * Campay calls our URL with the transaction as query parameters (GET) or a body (POST).
   * rawBody is the query string or body; authenticity = the JWT "signature" signed with the webhook key.
   * The service still re-checks the transaction with the Campay API before granting access.
   */
  parseWebhook(rawBody: string, _headers: Headers): WebhookResult {
    let t: Record<string, string> = {};
    const trimmed = rawBody.trim();
    try {
      if (trimmed.startsWith("{")) {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        t = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)]));
      } else {
        t = Object.fromEntries(new URLSearchParams(trimmed));
      }
    } catch {
      // invalid payload is recorded and ignored
    }
    const signatureValid = verifyHs256(t.signature ?? "", this.cfg.webhookKey ?? "");
    const references = [t.external_reference, t.reference].filter((r): r is string => typeof r === "string" && r.length > 0);
    const { signature: _sig, ...payload } = t;
    return {
      signatureValid,
      eventKey: t.reference ? `${t.reference}:${t.status ?? ""}` : createHash("sha256").update(rawBody).digest("hex"),
      eventType: t.status ?? null,
      references,
      payload,
    };
  }
}
