import { z } from "zod";
import { json, readJson } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { rejectManualPayment } from "@/server/payments/service";

const schema = z.object({ reason: z.string().trim().min(3).max(200) });

/** POST /api/admin/payments/:id/reject — staff reject a manual MoMo payment. Body: { reason }. */
export const POST = staffRoute("payments:approve", async (req, staff, ctx: RouteContext<"/api/admin/payments/[id]/reject">) => {
  const { id } = await ctx.params;
  const { reason } = await readJson(req, schema);
  await rejectManualPayment(id, staff.staff.id, reason);
  return json({ ok: true, message: "Rejected. The customer was told no access was granted." });
});
