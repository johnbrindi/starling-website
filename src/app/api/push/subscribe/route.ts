import { z } from "zod";
import { requireCustomer } from "@/server/auth/session";
import { db } from "@/server/db";
import { assertSameOrigin, handler, json, readJson } from "@/server/http";

const schema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});

/** POST /api/push/subscribe — registers this device for expiry notifications (customer consent). */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const { customer } = await requireCustomer();
  const sub = await readJson(req, schema);
  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { customerId: customer.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: req.headers.get("user-agent")?.slice(0, 200) },
    update: { customerId: customer.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth, failures: 0 },
  });
  await db.customer.update({ where: { id: customer.id }, data: { notificationConsent: true } });
  return json({ ok: true });
});

/** DELETE /api/push/subscribe — unregisters a device. */
export const DELETE = handler(async (req) => {
  assertSameOrigin(req);
  const { customer } = await requireCustomer();
  const { endpoint } = await readJson(req, z.object({ endpoint: z.url() }));
  await db.pushSubscription.deleteMany({ where: { endpoint, customerId: customer.id } });
  return json({ ok: true });
});
