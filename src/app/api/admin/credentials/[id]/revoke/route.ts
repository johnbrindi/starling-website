import { z } from "zod";
import { json, readJson } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { revokeCredential } from "@/server/subscriptions/service";

/** POST /api/admin/credentials/:id/revoke — { reason }. Removes the user from the router and disconnects. */
export const POST = staffRoute("customers:revoke", async (req, staff, ctx: RouteContext<"/api/admin/credentials/[id]/revoke">) => {
  const { id } = await ctx.params;
  const { reason } = await readJson(req, z.object({ reason: z.string().trim().min(3).max(200) }));
  await revokeCredential(id, staff.staff.id, reason, staff.ip);
  return json({ ok: true });
});
