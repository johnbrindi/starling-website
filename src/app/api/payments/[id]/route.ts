import { requireCustomer } from "@/server/auth/session";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { handler, json } from "@/server/http";
import { toPaymentDto } from "@/server/payments/dto";
import { verifyPayment } from "@/server/payments/service";
import { log } from "@/server/logger";
import { provisionNow } from "@/server/jobs/tick";

/**
 * GET /api/payments/:id — status of the signed-in customer's payment. While PENDING, each call
 * (at most every 4 s) asks the provider for the authoritative status.
 */
export const GET = handler(async (_req, ctx: RouteContext<"/api/payments/[id]">) => {
  const { id } = await ctx.params;
  const { customer } = await requireCustomer();
  let payment = await db.payment.findUnique({ where: { id }, include: { package: true } });
  if (!payment || payment.customerId !== customer.id) throw new AppError("NOT_FOUND", "Payment not found.");
  const stale = !payment.lastCheckedAt || Date.now() - payment.lastCheckedAt.getTime() > 4000;
  if (payment.status === "PENDING" && stale) {
    try {
      await verifyPayment(payment.id);
    } catch (err) {
      log.warn("Status check failed; will retry", { paymentId: payment.id, error: (err as Error).message });
    }
    payment = await db.payment.findUniqueOrThrow({ where: { id }, include: { package: true } });
  }
  if (payment.status === "SUCCEEDED") await provisionNow(customer.id);
  return json({ payment: toPaymentDto(payment) });
});
