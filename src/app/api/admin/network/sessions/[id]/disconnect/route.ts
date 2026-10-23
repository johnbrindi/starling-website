import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { json } from "@/server/http";
import { audit } from "@/server/audit";
import { staffRoute } from "@/server/admin/route";
import { getNetworkAdapter } from "@/server/network";

/** POST /api/admin/network/sessions/:id/disconnect — kick a user's devices (access stays valid; they can log in again). */
export const POST = staffRoute("customers:revoke", async (_req, staff, ctx: RouteContext<"/api/admin/network/sessions/[id]/disconnect">) => {
  const { id } = await ctx.params;
  const s = await db.networkSession.findUnique({ where: { id } });
  if (!s) throw new AppError("NOT_FOUND", "Session not found.");
  const n = await getNetworkAdapter().disconnectUser(s.username);
  await db.networkSession.updateMany({ where: { username: s.username, endedAt: null }, data: { endedAt: new Date(), endReason: "disconnected-by-staff" } });
  await audit({ actorType: "STAFF", actorId: staff.staff.id, action: "session.disconnected", targetType: "NetworkSession", targetId: id, ipAddress: staff.ip, metadata: { count: n } });
  return json({ disconnected: n });
});
