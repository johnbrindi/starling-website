import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { json } from "@/server/http";
import { audit } from "@/server/audit";
import { enqueue } from "@/server/jobs/queue";
import { runJobsNow } from "@/server/jobs/tick";
import { staffRoute } from "@/server/admin/route";
import { isEntitled } from "@/server/subscriptions/service";

/** POST /api/admin/credentials/:id/resync — re-push (or remove) this credential on the network now. */
export const POST = staffRoute("network:manage", async (_req, staff, ctx: RouteContext<"/api/admin/credentials/[id]/resync">) => {
  const { id } = await ctx.params;
  const c = await db.accessCredential.findUnique({ where: { id } });
  if (!c) throw new AppError("NOT_FOUND", "Credential not found.");
  const job = isEntitled(c)
    ? await enqueue("PROVISION_CREDENTIAL", { credentialId: id }, { dedupeKey: `provision:${id}`, maxAttempts: 20 })
    : await enqueue("DEPROVISION_CREDENTIAL", { credentialId: id }, { dedupeKey: `deprovision:${id}`, maxAttempts: 30 });
  await runJobsNow([job.id]);
  await audit({ actorType: "STAFF", actorId: staff.staff.id, action: "credential.resync", targetType: "AccessCredential", targetId: id, ipAddress: staff.ip });
  const after = await db.accessCredential.findUniqueOrThrow({ where: { id } });
  return json({ provisionState: after.provisionState, lastSyncError: after.lastSyncError });
});
