import { z } from "zod";
import { json, readJson } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { db } from "@/server/db";

const schema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

/** POST /api/admin/push/subscribe — this staff device receives "payment to confirm" notifications. */
export const POST = staffRoute("payments:approve", async (req, staff) => {
  const sub = await readJson(req, schema);
  await db.staffPushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { staffId: staff.staff.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: req.headers.get("user-agent")?.slice(0, 300) },
    update: { staffId: staff.staff.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth, failures: 0 },
  });
  return json({ ok: true });
});

/** DELETE /api/admin/push/subscribe — stop notifications on this device. Body: { endpoint }. */
export const DELETE = staffRoute("payments:approve", async (req, staff) => {
  const { endpoint } = await readJson(req, z.object({ endpoint: z.url().max(1000) }));
  await db.staffPushSubscription.deleteMany({ where: { endpoint, staffId: staff.staff.id } });
  return json({ ok: true });
});
