import { requireCustomer } from "@/server/auth/session";
import { db } from "@/server/db";
import { assertSameOrigin, handler, json } from "@/server/http";

/** GET /api/me/notifications — recent in-app notices. */
export const GET = handler(async () => {
  const { customer } = await requireCustomer();
  const items = await db.notification.findMany({
    where: { customerId: customer.id, channel: "IN_APP" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, type: true, title: true, body: true, createdAt: true, readAt: true },
  });
  return json({ notifications: items, unread: items.filter((i) => !i.readAt).length });
});

/** POST /api/me/notifications — marks all notices as read. */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const { customer } = await requireCustomer();
  await db.notification.updateMany({ where: { customerId: customer.id, readAt: null }, data: { readAt: new Date() } });
  return json({ ok: true });
});
