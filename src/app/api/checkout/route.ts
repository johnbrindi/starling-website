import { createSession, getCustomer } from "@/server/auth/session";
import { assertSameOrigin, clientIp, handler, json, readJson } from "@/server/http";
import { checkoutSchema, createCheckout } from "@/server/payments/service";
import { rateLimit } from "@/server/rate-limit";
import { toPaymentDto } from "@/server/payments/dto";
import { db } from "@/server/db";

/**
 * POST /api/checkout — starts a Mobile Money payment for a package.
 * Body: { packageId, phone, channel: "cm.mtn"|"cm.orange", name?, idempotencyKey (uuid), clientMac?, clientIp? }
 * Never grants access; poll GET /api/payments/:id for the verified result.
 */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  await rateLimit(`checkout:ip:${ip}`, 10, 600);
  const input = await readJson(req, checkoutSchema);
  await rateLimit(`checkout:phone:${input.phone.replace(/\D/g, "").slice(-9)}`, 5, 600);
  const { payment, instructions } = await createCheckout(input);

  // Sign the buyer in (cookie) so they can follow the payment and see their code.
  const current = await getCustomer();
  if (current?.customer.id !== payment.customerId) {
    await createSession("CUSTOMER", payment.customerId, { ipAddress: ip, userAgent: req.headers.get("user-agent") });
  }
  const full = await db.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { package: true } });
  return json({ payment: toPaymentDto(full), instructions }, { status: 201 });
});
