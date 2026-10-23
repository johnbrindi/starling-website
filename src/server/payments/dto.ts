import "server-only";
import type { Package, Payment } from "@/generated/prisma/client";
import type { PaymentDto } from "@/lib/types";

export function toPaymentDto(p: Payment & { package: Package }): PaymentDto {
  return {
    id: p.id,
    reference: p.reference,
    status: p.status,
    amountXaf: p.amountXaf,
    packageName: p.package.name,
    channel: p.channel,
    payerPhone: p.payerPhone,
    isSimulated: p.isSimulated,
    failureReason: p.failureReason,
    createdAt: p.createdAt.toISOString(),
    expiresAt: p.expiresAt.toISOString(),
  };
}
