// Payment provider contract. A provider only reports facts; the payment service decides what to do.

export type ProviderId = "SIMULATOR" | "NOTCHPAY" | "FAPSHI" | "CAMPAY" | "MANUAL";

export type ProviderStatus = "pending" | "succeeded" | "failed" | "cancelled" | "expired";

export type MobileMoneyChannel = "cm.mtn" | "cm.orange";

export interface InitiateInput {
  reference: string;
  amountXaf: number;
  phone: string; // E.164
  channel: MobileMoneyChannel;
  description: string;
  customerName?: string | null;
}

export interface InitiateResult {
  /** Null when the provider has no transaction yet (manual MoMo: the customer submits it later). */
  providerReference: string | null;
  status: ProviderStatus;
  /** Customer-facing instruction, e.g. "Approve the prompt on your phone". */
  instructions?: string;
}

export interface StatusResult {
  status: ProviderStatus;
  providerReference: string;
  /** Amount/currency as reported by the provider; activation requires an exact match. */
  amountXaf: number | null;
  currency: string | null;
  /** Our reference echoed back by the provider when available. */
  merchantReference: string | null;
  rawStatus: string;
  failureReason?: string;
}

export interface WebhookResult {
  signatureValid: boolean;
  eventKey: string;
  eventType: string | null;
  /** Either our reference or the provider reference; the service looks up both. */
  references: string[];
  payload: unknown;
}

export interface PaymentProviderAdapter {
  readonly id: ProviderId;
  readonly simulated: boolean;
  initiate(input: InitiateInput): Promise<InitiateResult>;
  fetchStatus(payment: { reference: string; providerReference: string | null }): Promise<StatusResult>;
  parseWebhook(rawBody: string, headers: Headers): WebhookResult;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
