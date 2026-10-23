import { requireCustomer } from "@/server/auth/session";
import { db } from "@/server/db";
import { handler, json } from "@/server/http";
import { toPaymentDto } from "@/server/payments/dto";

/** GET /api/me/history — the customer's payments and subscription periods. */
export const GET = handler(async () => {
  const { customer } = await requireCustomer();
  const [payments, subscriptions] = await Promise.all([
    db.payment.findMany({ where: { customerId: customer.id }, include: { package: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.subscription.findMany({ where: { customerId: customer.id }, include: { package: true }, orderBy: { startsAt: "desc" }, take: 50 }),
  ]);
  return json({
    payments: payments.map(toPaymentDto),
    subscriptions: subscriptions.map((s) => ({
      id: s.id,
      packageName: s.package.name,
      status: s.status,
      priceXaf: s.priceXaf,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      source: s.voucherId ? "voucher" : "payment",
    })),
  });
});
