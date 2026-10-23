import { requireCustomer } from "@/server/auth/session";
import { assertSameOrigin, clientIp, handler, json, readJson } from "@/server/http";
import { checkoutSchema, createCheckout } from "@/server/payments/service";
import { rateLimit } from "@/server/rate-limit";
import { toPaymentDto } from "@/server/payments/dto";
import { db } from "@/server/db";

/**
 * POST /api/checkout — starts a Mobile Money payment for the signed-in customer.
 * Body: { packageId, phone (payer), channel: "cm.mtn"|"cm.orange", idempotencyKey (uuid), clientMac?, clientIp? }
 * Never grants access; poll GET /api/payments/:id for the verified result.
 */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const { customer } = await requireCustomer();
  await rateLimit(`checkout:ip:${clientIp(req)}`, 10, 600);
  await rateLimit(`checkout:customer:${customer.id}`, 6, 600);
  const input = await readJson(req, checkoutSchema);
  const { payment, instructions } = await createCheckout(customer.id, input);
  const full = await db.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { package: true } });
  return json({ payment: toPaymentDto(full), instructions }, { status: 201 });
});
