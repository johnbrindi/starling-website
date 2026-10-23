import { json } from "@/server/http";
import { audit } from "@/server/audit";
import { staffRoute } from "@/server/admin/route";
import { verifyPayment } from "@/server/payments/service";

/** POST /api/admin/payments/:id/verify — re-check with the provider now (never marks paid manually). */
export const POST = staffRoute("payments:reconcile", async (_req, staff, ctx: RouteContext<"/api/admin/payments/[id]/verify">) => {
  const { id } = await ctx.params;
  const p = await verifyPayment(id);
  await audit({ actorType: "STAFF", actorId: staff.staff.id, action: "payment.reverified", targetType: "Payment", targetId: id, ipAddress: staff.ip, metadata: { status: p.status } });
  return json({ status: p.status, failureReason: p.failureReason });
});
