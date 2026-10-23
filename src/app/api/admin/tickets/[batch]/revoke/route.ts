import { json } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { revokeUnusedTickets } from "@/server/tickets";

/** POST /api/admin/tickets/:batch/revoke — disable every unused ticket of a batch (lost/stolen sheet). */
export const POST = staffRoute("customers:revoke", async (_req, staff, ctx: RouteContext<"/api/admin/tickets/[batch]/revoke">) => {
  const { batch } = await ctx.params;
  return json({ result: { revoked: await revokeUnusedTickets(batch, staff.staff.id, staff.ip) } });
});
