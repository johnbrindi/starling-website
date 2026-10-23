import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { InitiateInput, InitiateResult, PaymentProviderAdapter, ProviderStatus, StatusResult, WebhookResult } from "../types";
import { ProviderError } from "../types";

export interface NotchPayConfig {
  baseUrl: string;
  publicKey: string;
  webhookHash: string;
  timeoutMs?: number;
}

const STATUS_MAP: Record<string, ProviderStatus> = {
  pending: "pending",
  processing: "pending",
  complete: "succeeded",
  failed: "failed",
  canceled: "cancelled",
  cancelled: "cancelled",
  expired: "expired",
};

interface NotchTransaction {
  id?: string;
  reference?: string;
  trxref?: string;
  merchant_reference?: string;
  amount?: number;
  currency?: string;
  status?: string;
}

/**
 * Notch Pay (https://developer.notchpay.co) direct Mobile Money charge for Cameroon.
 * Flow: POST /payments (initialise) -> POST /payments/{reference} with channel cm.mtn|cm.orange
 * (USSD push to the customer's phone) -> webhook and/or GET /payments/{reference} for the result.
 * The customer's phone never needs to reach the provider, which suits a captive portal.
 */
export class NotchPayProvider implements PaymentProviderAdapter {
  readonly id = "NOTCHPAY" as const;
  readonly simulated = false;

  constructor(private readonly cfg: NotchPayConfig) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.cfg.baseUrl}${path}`, {
        method,
        headers: { Authorization: this.cfg.publicKey, Accept: "application/json", "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 15_000),
        cache: "no-store",
      });
    } catch (err) {
      throw new ProviderError(`Notch Pay unreachable: ${(err as Error).message}`, true);
    }
    const text = await res.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new ProviderError(`Notch Pay returned non-JSON (HTTP ${res.status})`, res.status >= 500);
    }
    if (!res.ok) {
      const msg = (data as { message?: string }).message ?? `HTTP ${res.status}`;
      throw new ProviderError(`Notch Pay error: ${msg}`, res.status >= 500 || res.status === 429);
    }
    return data as T;
  }

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const created = await this.request<{ transaction?: NotchTransaction }>("POST", "/payments", {
      amount: input.amountXaf, // XAF has no minor unit
      currency: "XAF",
      reference: input.reference,
      description: input.description,
      customer: { phone: input.phone, ...(input.customerName ? { name: input.customerName } : {}) },
    });
    const providerReference = created.transaction?.reference;
    if (!providerReference) throw new ProviderError("Notch Pay did not return a transaction reference", false);

    await this.request("POST", `/payments/${encodeURIComponent(providerReference)}`, {
      channel: input.channel,
      data: { phone: input.phone },
    });
    return {
      providerReference,
      status: "pending",
      instructions:
        input.channel === "cm.mtn"
          ? "Check your phone and approve the MTN Mobile Money prompt with your PIN. If no prompt appears, dial *126#."
          : "Check your phone and approve the Orange Money prompt with your PIN. If no prompt appears, dial #150*50#.",
    };
  }

  async fetchStatus(payment: { reference: string; providerReference: string | null }): Promise<StatusResult> {
    const ref = payment.providerReference ?? payment.reference;
    const data = await this.request<{ transaction?: NotchTransaction }>("GET", `/payments/${encodeURIComponent(ref)}`);
    const t = data.transaction ?? {};
    const raw = String(t.status ?? "unknown").toLowerCase();
    return {
      status: STATUS_MAP[raw] ?? "pending",
      providerReference: t.reference ?? ref,
      amountXaf: typeof t.amount === "number" ? t.amount : t.amount ? Number(t.amount) : null,
      currency: t.currency ?? null,
      merchantReference: t.merchant_reference ?? t.trxref ?? null,
      rawStatus: raw,
      failureReason: raw === "failed" ? "The payment was declined or failed at the operator." : undefined,
    };
  }

  /** x-notch-signature = hex HMAC-SHA256 of the raw request body using the webhook hash key. */
  parseWebhook(rawBody: string, headers: Headers): WebhookResult {
    const signature = headers.get("x-notch-signature") ?? "";
    const expected = createHmac("sha256", this.cfg.webhookHash).update(rawBody, "utf8").digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    const signatureValid = a.length === b.length && timingSafeEqual(a, b);
    let payload: { id?: string; type?: string; event?: string; data?: NotchTransaction } = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      // keep empty payload; signature check still recorded
    }
    const d = payload.data ?? {};
    const references = [d.reference, d.trxref, d.merchant_reference].filter((r): r is string => typeof r === "string" && r.length > 0);
    return {
      signatureValid,
      eventKey: payload.id ?? createHash("sha256").update(rawBody).digest("hex"),
      eventType: payload.type ?? payload.event ?? null,
      references,
      payload,
    };
  }
}
