import { createHash, timingSafeEqual } from "node:crypto";
import type { InitiateInput, InitiateResult, PaymentProviderAdapter, ProviderStatus, StatusResult, WebhookResult } from "../types";
import { ProviderError } from "../types";

export interface FapshiConfig {
  baseUrl: string; // https://sandbox.fapshi.com | https://live.fapshi.com
  apiUser: string;
  apiKey: string;
  webhookSecret?: string;
  /** Direct Pay (prompt on the phone) is activated by Fapshi on live accounts; until then the payment page is used. */
  directPay?: boolean;
  /** Email sent with payment pages so the customer only types their MoMo number. */
  receiptEmail?: string;
  timeoutMs?: number;
}

const STATUS: Record<string, ProviderStatus> = {
  CREATED: "pending",
  PENDING: "pending",
  SUCCESSFUL: "succeeded",
  FAILED: "failed",
  EXPIRED: "expired",
};

interface FapshiTransaction {
  transId?: string;
  status?: string;
  amount?: number;
  externalId?: string | null;
  financialTransId?: string | null;
  medium?: string | null;
}

/**
 * Fapshi (https://docs.fapshi.com). Two ways to collect, same status/webhook handling:
 * - Direct Pay: the customer gets the MTN MoMo prompt on their phone and approves with their PIN.
 *   Disabled by default on live accounts until Fapshi support activates it (cfg.directPay).
 * - Initiate Pay: Fapshi's hosted payment page (checkout.fapshi.com); the customer enters their
 *   number there and is sent back to returnUrl. Works on any verified account.
 * Status: GET /payment-status/{transId} (max 6 requests per minute per transaction).
 * Webhook: POST with header x-wh-secret.
 */
export class FapshiProvider implements PaymentProviderAdapter {
  readonly id = "FAPSHI" as const;
  readonly simulated = false;

  constructor(private readonly cfg: FapshiConfig) {}

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.cfg.baseUrl}${path}`, {
        method,
        headers: { apiuser: this.cfg.apiUser, apikey: this.cfg.apiKey, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 20_000),
        cache: "no-store",
      });
    } catch (err) {
      throw new ProviderError(`Fapshi unreachable: ${(err as Error).message}`, true);
    }
    const text = await res.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new ProviderError(`Fapshi returned non-JSON (HTTP ${res.status})`, res.status >= 500);
    }
    if (!res.ok) {
      const msg = (data as { message?: string }).message ?? `HTTP ${res.status}`;
      throw new ProviderError(`Fapshi error: ${msg}`, res.status >= 500 || res.status === 429);
    }
    return data as T;
  }

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    if (!this.cfg.directPay) return this.initiatePage(input);
    const phone = input.phone.replace(/^\+237/, ""); // Fapshi expects 9 digits, e.g. 67XXXXXXX
    const res = await this.request<{ transId?: string; message?: string }>("POST", "/direct-pay", {
      amount: input.amountXaf,
      phone,
      medium: input.channel === "cm.orange" ? "orange money" : "mobile money",
      ...(input.customerName ? { name: input.customerName.slice(0, 60) } : {}),
      externalId: input.reference,
      message: input.description.slice(0, 100),
    });
    if (!res.transId) throw new ProviderError("Fapshi did not return a transaction id", false);
    return {
      providerReference: res.transId,
      status: "pending",
      instructions:
        input.channel === "cm.orange"
          ? "Check your phone and approve the Orange Money request with your PIN. If no prompt appears, dial #150*50#."
          : "Check your phone and approve the MTN MoMo request with your PIN. If no prompt appears, dial *126#.",
    };
  }

  /** Hosted payment page (Initiate Pay). */
  private async initiatePage(input: InitiateInput): Promise<InitiateResult> {
    const res = await this.request<{ link?: string; transId?: string }>("POST", "/initiate-pay", {
      amount: input.amountXaf,
      ...(this.cfg.receiptEmail ? { email: this.cfg.receiptEmail } : {}),
      ...(input.returnUrl ? { redirectUrl: input.returnUrl } : {}),
      externalId: input.reference,
      userId: input.reference,
      message: input.description.slice(0, 100),
    });
    if (!res.transId || !res.link || !/^https:\/\/checkout\.fapshi\.com\//.test(res.link)) {
      throw new ProviderError("Fapshi did not return a payment page", true);
    }
    return {
      providerReference: res.transId,
      status: "pending",
      checkoutUrl: res.link,
      instructions: "On the Fapshi page, enter your MTN MoMo number, tap Pay, then approve the request on your phone with your PIN.",
    };
  }

  async fetchStatus(payment: { reference: string; providerReference: string | null }): Promise<StatusResult> {
    if (!payment.providerReference) throw new ProviderError("Missing Fapshi transaction id", false);
    const t = await this.request<FapshiTransaction>("GET", `/payment-status/${encodeURIComponent(payment.providerReference)}`);
    const raw = String(t.status ?? "UNKNOWN").toUpperCase();
    return {
      status: STATUS[raw] ?? "pending",
      providerReference: t.transId ?? payment.providerReference,
      amountXaf: typeof t.amount === "number" ? t.amount : null,
      currency: "XAF",
      merchantReference: t.externalId ?? null,
      rawStatus: raw,
      failureReason: raw === "FAILED" ? "The payment was declined, cancelled or failed at the operator." : undefined,
    };
  }

  /** Fapshi sends the transaction object; authenticity = the x-wh-secret header we configured. */
  parseWebhook(rawBody: string, headers: Headers): WebhookResult {
    const expected = this.cfg.webhookSecret ?? "";
    const got = headers.get("x-wh-secret") ?? "";
    const a = Buffer.from(got);
    const b = Buffer.from(expected);
    const signatureValid = expected.length > 0 && a.length === b.length && timingSafeEqual(a, b);
    let t: FapshiTransaction = {};
    try {
      t = JSON.parse(rawBody);
    } catch {
      // invalid JSON is recorded and ignored
    }
    const references = [t.externalId, t.transId].filter((r): r is string => typeof r === "string" && r.length > 0);
    return {
      signatureValid,
      // One event per status change; transId+status keeps duplicates out.
      eventKey: t.transId ? `${t.transId}:${t.status ?? ""}` : createHash("sha256").update(rawBody).digest("hex"),
      eventType: t.status ?? null,
      references,
      payload: t,
    };
  }
}
