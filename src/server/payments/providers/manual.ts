import type { InitiateInput, InitiateResult, PaymentProviderAdapter, StatusResult, WebhookResult } from "../types";
import { ProviderError } from "../types";

export interface ManualMomoConfig {
  /** MTN MoMo number customers send the money to, 9 digits (e.g. 677358806). */
  momoNumber: string;
}

/** USSD code that sends `amountXaf` to the business MoMo number. */
export function momoUssd(momoNumber: string, amountXaf: number) {
  return `*126*9*${momoNumber}*${amountXaf}#`;
}

/**
 * Manual MTN MoMo: the customer sends the money with the USSD code and submits the transaction ID
 * from the MTN SMS; a staff member checks the SMS on the business phone and approves it in the
 * admin console. There is no provider API, so nothing here can mark a payment as paid.
 */
export class ManualMomoProvider implements PaymentProviderAdapter {
  readonly id = "MANUAL" as const;
  readonly simulated = false;

  constructor(private readonly cfg: ManualMomoConfig) {}

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    return {
      providerReference: null,
      status: "pending",
      instructions: `Dial ${momoUssd(this.cfg.momoNumber, input.amountXaf)} on your MTN phone and enter your PIN. Then type the Transaction ID from the MTN SMS below.`,
    };
  }

  async fetchStatus(): Promise<StatusResult> {
    throw new ProviderError("Manual MoMo payments are confirmed by staff", false);
  }

  parseWebhook(): WebhookResult {
    return { signatureValid: false, eventKey: "manual", eventType: null, references: [], payload: {} };
  }
}
