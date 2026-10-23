import "server-only";
import { db } from "../db";
import { errorMessage, log } from "../logger";
import { checkNetworkHealth, reconcileNetwork, syncProfiles, syncSessions } from "../network/sync";
import { sendNotificationJob, warnExpiring } from "../notifications/service";
import { reconcilePayments, verifyPayment } from "../payments/service";
import { purgeExpiredRateLimits } from "../rate-limit";
import { purgeExpiredSessions } from "../auth/session";
import { getSettings } from "../settings";
import { deprovisionCredentialJob, expireDue, provisionCredentialJob } from "../subscriptions/service";
import { runDueJobs, type JobHandler, type JobType } from "./queue";

export const JOB_HANDLERS: Record<JobType, JobHandler> = {
  PROVISION_CREDENTIAL: provisionCredentialJob,
  DEPROVISION_CREDENTIAL: deprovisionCredentialJob,
  SEND_NOTIFICATION: sendNotificationJob,
  VERIFY_PAYMENT: async (job) => {
    await verifyPayment((job.payload as { paymentId: string }).paymentId);
  },
  SYNC_PROFILE: async () => {
    await syncProfiles();
  },
};

/**
 * Fast path after a payment or voucher: push the customer's pending credential to the router now
 * instead of waiting for the worker. Failures are fine: the job stays queued and the worker retries.
 */
export async function provisionNow(customerId: string) {
  try {
    const creds = await db.accessCredential.findMany({ where: { customerId, provisionState: { in: ["PENDING", "FAILED"] } }, select: { id: true } });
    if (creds.length === 0) return;
    const jobs = await db.job.findMany({
      where: {
        type: "PROVISION_CREDENTIAL",
        status: { in: ["PENDING", "FAILED"] },
        runAt: { lte: new Date() },
        OR: creds.map((c) => ({ payload: { path: ["credentialId"], equals: c.id } })),
      },
      select: { id: true },
    });
    if (jobs.length) await runJobsNow(jobs.map((j) => j.id));
  } catch (err) {
    log.warn("Immediate provisioning failed; worker will retry", { customerId, error: errorMessage(err) });
  }
}

/** Runs specific jobs right away (e.g. provisioning straight after payment) without waiting for the worker. */
export function runJobsNow(ids: string[]) {
  return runDueJobs(JOB_HANDLERS, { ids, limit: ids.length });
}

interface Task {
  name: string;
  everySeconds: (s: Awaited<ReturnType<typeof getSettings>>) => number;
  run: () => Promise<unknown>;
}

const TASKS: Task[] = [
  { name: "expire", everySeconds: () => 10, run: () => expireDue() },
  { name: "jobs", everySeconds: () => 5, run: () => runDueJobs(JOB_HANDLERS, { limit: 25 }) },
  { name: "warnings", everySeconds: () => 30, run: () => warnExpiring() },
  { name: "payments", everySeconds: () => 20, run: () => reconcilePayments() },
  { name: "sessions", everySeconds: (s) => s.sessionSyncSeconds, run: () => syncSessions() },
  { name: "health", everySeconds: () => 120, run: () => checkNetworkHealth() },
  { name: "reconcile-network", everySeconds: () => 300, run: () => reconcileNetwork() },
  {
    name: "housekeeping",
    everySeconds: () => 3600,
    run: async () => {
      await purgeExpiredSessions();
      await purgeExpiredRateLimits();
      // Retention: finished jobs after 14 days; webhook payloads after 180 days.
      await db.job.deleteMany({ where: { status: "SUCCEEDED", completedAt: { lt: new Date(Date.now() - 14 * 86400_000) } } });
      await db.webhookEvent.deleteMany({ where: { receivedAt: { lt: new Date(Date.now() - 180 * 86400_000) } } });
    },
  },
];

const lastRun = new Map<string, number>();

/**
 * One scheduler pass: runs every task that is due. Each task is isolated so a router outage
 * never stops expiry or payment processing. Safe to run from several processes (all tasks are idempotent).
 */
export async function tick(opts: { force?: boolean } = {}) {
  const settings = await getSettings();
  const now = Date.now();
  const results: Record<string, string> = {};
  for (const t of TASKS) {
    const due = opts.force || now - (lastRun.get(t.name) ?? 0) >= t.everySeconds(settings) * 1000;
    if (!due) continue;
    lastRun.set(t.name, now);
    try {
      await t.run();
      results[t.name] = "ok";
    } catch (err) {
      results[t.name] = `error: ${errorMessage(err)}`;
      log.warn("Scheduled task failed", { task: t.name, error: errorMessage(err) });
    }
  }
  return results;
}
