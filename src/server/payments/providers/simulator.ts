import type { PrismaClient } from "@/generated/prisma/client";
import { createHash } from "node:crypto";
import type { InitiateInput, InitiateResult, PaymentProviderAdapter, ProviderStatus, StatusResult, WebhookResult } from "../types";

/**
 * DEVELOPMENT ONLY. Simulates a Mobile Money provider. Outcome is decided by the last digit of the
 * phone number (same convention as Notch Pay sandbox numbers) or by the dev approve/decline buttons:
 *   ...0 -> succeeds after the first status check, ...1 / ...2 -> fails, ...4 -> cancelled,
 *   anything else -> stays pending until approved/declined from the dev panel.
 * The "remote" state lives in Payment.providerStatus. Env validation forbids this provider in production.
 */
export class SimulatorProvider implements PaymentProviderAdapter {
  readonly id = "SIMULATOR" as const;
  readonly simulated = true;

  constructor(private readonly db: PrismaClient) {}

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    return {
      providerReference: `SIM-${input.reference}`,
      status: "pending",
      instructions: "SIMULATED PAYMENT. No money will move. Use the development controls to approve or decline.",
    };
  }

  static outcomeForPhone(phone: string): ProviderStatus {
    const last = phone.at(-1);
    if (last === "0") return "succeeded";
    if (last === "1" || last === "2") return "failed";
    if (last === "4") return "cancelled";
    return "pending";
  }

  async fetchStatus(payment: { reference: string; providerReference: string | null }): Promise<StatusResult> {
    const row = await this.db.payment.findUnique({ where: { reference: payment.reference } });
    if (!row) throw new Error("Unknown simulated payment");
    const forced = row.providerStatus as ProviderStatus | null;
    const status: ProviderStatus =
      forced && ["succeeded", "failed", "cancelled", "expired"].includes(forced) ? forced : SimulatorProvider.outcomeForPhone(row.payerPhone);
    return {
      status,
      providerReference: row.providerReference ?? `SIM-${row.reference}`,
      amountXaf: row.amountXaf,
      currency: "XAF",
      merchantReference: row.reference,
      rawStatus: `simulated:${status}`,
      failureReason: status === "failed" ? "Simulated failure (insufficient funds)" : undefined,
    };
  }

  parseWebhook(rawBody: string): WebhookResult {
    const payload = JSON.parse(rawBody) as { reference?: string };
    return {
      signatureValid: true,
      eventKey: createHash("sha256").update(rawBody).digest("hex"),
      eventType: "simulated",
      references: payload.reference ? [payload.reference] : [],
      payload,
    };
  }
}
