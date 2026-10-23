import { json } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { unusedTickets } from "@/server/tickets";

/** POST /api/admin/tickets/:batch/reprint — unused tickets of a batch, to print again (audited). */
export const POST = staffRoute("packages:manage", async (_req, staff, ctx: RouteContext<"/api/admin/tickets/[batch]/reprint">) => {
  const { batch } = await ctx.params;
  return json({ batch, tickets: await unusedTickets(batch, staff.staff.id, staff.ip) });
});
