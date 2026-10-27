import { json } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { resumeLogin } from "@/server/network/control";

/** POST /api/admin/credentials/:id/resume — resume a paused login; paused time is added back. */
export const POST = staffRoute("customers:revoke", async (_req, staff, ctx: RouteContext<"/api/admin/credentials/[id]/resume">) => {
  const { id } = await ctx.params;
  await resumeLogin(id, staff.staff.id, staff.ip);
  return json({ ok: true, message: "Resumed. The paused time was added back." });
});
