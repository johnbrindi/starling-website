import { json } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { approveManualPayment } from "@/server/payments/service";

/** POST /api/admin/payments/:id/approve — staff confirm a manual MoMo payment (checked against the MTN SMS). */
export const POST = staffRoute("payments:approve", async (_req, staff, ctx: RouteContext<"/api/admin/payments/[id]/approve">) => {
  const { id } = await ctx.params;
  await approveManualPayment(id, staff.staff.id);
  return json({ ok: true, message: "Approved. The login is being sent to the Wi-Fi router." });
});
