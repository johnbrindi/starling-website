import { requireCustomer } from "@/server/auth/session";
import { assertSameOrigin, clientIp, handler, json, readJson } from "@/server/http";
import { claimManualPayment, claimSchema } from "@/server/payments/service";
import { toPaymentDto } from "@/server/payments/dto";
import { rateLimit } from "@/server/rate-limit";

/**
 * POST /api/payments/:id/claim — the customer submits the MTN MoMo transaction ID of a manual
 * payment. Body: { transactionId }. Staff still confirm it before any access is granted.
 */
export const POST = handler(async (req, ctx: RouteContext<"/api/payments/[id]/claim">) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const { customer } = await requireCustomer();
  await rateLimit(`claim:ip:${clientIp(req)}`, 20, 600);
  await rateLimit(`claim:customer:${customer.id}`, 10, 600);
  const payment = await claimManualPayment(customer.id, id, await readJson(req, claimSchema));
  return json({ payment: toPaymentDto(payment) });
});
