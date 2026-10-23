import { json } from "@/server/http";
import { audit } from "@/server/audit";
import { staffRoute } from "@/server/admin/route";
import { retryDeadJob } from "@/server/jobs/queue";
import { runJobsNow } from "@/server/jobs/tick";

/** POST /api/admin/jobs/:id/retry — re-run a failed or dead job now. */
export const POST = staffRoute("network:manage", async (_req, staff, ctx: RouteContext<"/api/admin/jobs/[id]/retry">) => {
  const { id } = await ctx.params;
  await retryDeadJob(id);
  await runJobsNow([id]);
  await audit({ actorType: "STAFF", actorId: staff.staff.id, action: "job.retried", targetType: "Job", targetId: id, ipAddress: staff.ip });
  return json({ ok: true });
});
