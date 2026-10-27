import { json } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { pauseLogin } from "@/server/network/control";

/** POST /api/admin/credentials/:id/pause — pause a login (no access, remaining time kept). */
export const POST = staffRoute("customers:revoke", async (_req, staff, ctx: RouteContext<"/api/admin/credentials/[id]/pause">) => {
  const { id } = await ctx.params;
  await pauseLogin(id, staff.staff.id, staff.ip);
  return json({ ok: true, message: "Paused. Their remaining time is kept." });
});
