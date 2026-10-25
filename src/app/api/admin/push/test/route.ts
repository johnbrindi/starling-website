import { json } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { pushToStaff } from "@/server/notifications/staff";

/** POST /api/admin/push/test — sends a test notification to the signed-in staff member's devices. */
export const POST = staffRoute("payments:approve", async (_req, staff) => {
  const r = await pushToStaff({ title: "Juthelink notifications are on", body: "You will get a message like this for every MoMo payment to confirm.", tag: "test", url: "/admin/confirm" }, { staffId: staff.staff.id });
  return json({ ok: r.sent > 0, ...r, message: r.sent > 0 ? `Sent to ${r.sent} device(s).` : "No device received it. Turn notifications on again on this phone." });
});
