import { z } from "zod";
import { db } from "@/server/db";
import { json, readJson } from "@/server/http";
import { audit } from "@/server/audit";
import { staffRoute } from "@/server/admin/route";
import { revokeCredential } from "@/server/subscriptions/service";

/** POST /api/admin/customers/:id/block — { blocked, reason }. Blocking also revokes active access. */
export const POST = staffRoute("customers:revoke", async (req, staff, ctx: RouteContext<"/api/admin/customers/[id]/block">) => {
  const { id } = await ctx.params;
  const { blocked, reason } = await readJson(req, z.object({ blocked: z.boolean(), reason: z.string().trim().min(3).max(200) }));
  await db.customer.update({ where: { id }, data: { isBlocked: blocked } });
  if (blocked) {
    await db.session.deleteMany({ where: { customerId: id } });
    const active = await db.accessCredential.findMany({ where: { customerId: id, status: "ACTIVE" }, select: { id: true } });
    for (const c of active) await revokeCredential(c.id, staff.staff.id, `Customer blocked: ${reason}`, staff.ip);
  }
  await audit({ actorType: "STAFF", actorId: staff.staff.id, action: blocked ? "customer.blocked" : "customer.unblocked", targetType: "Customer", targetId: id, ipAddress: staff.ip, metadata: { reason } });
  return json({ ok: true });
});
