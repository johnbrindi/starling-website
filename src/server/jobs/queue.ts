import "server-only";
import { hostname } from "node:os";
import type { Job, Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "../db";
import { errorMessage, log } from "../logger";

export type JobType =
  | "PROVISION_CREDENTIAL"
  | "DEPROVISION_CREDENTIAL"
  | "VERIFY_PAYMENT"
  | "SEND_NOTIFICATION"
  | "SYNC_PROFILE";

export interface EnqueueOptions {
  dedupeKey?: string;
  runAt?: Date;
  maxAttempts?: number;
}

/** Thrown by a handler to say "try again shortly" without consuming an attempt. */
export class RetrySoon extends Error {
  constructor(
    message: string,
    readonly delayMs = 2000,
  ) {
    super(message);
  }
}

/**
 * Adds a job. With a dedupeKey, at most one unfinished job exists per key; enqueueing again
 * pulls its runAt forward instead of creating a duplicate.
 */
export async function enqueue(type: JobType, payload: Record<string, unknown>, opts: EnqueueOptions = {}, tx: Tx = db) {
  const runAt = opts.runAt ?? new Date();
  const data = {
    type,
    payload: payload as Prisma.InputJsonValue,
    runAt,
    maxAttempts: opts.maxAttempts ?? 8,
  };
  if (!opts.dedupeKey) return tx.job.create({ data });
  const existing = await tx.job.findUnique({ where: { dedupeKey: opts.dedupeKey } });
  if (existing) {
    if (existing.status !== "RUNNING" && existing.runAt > runAt) {
      return tx.job.update({ where: { id: existing.id }, data: { runAt, status: "PENDING" } });
    }
    return existing;
  }
  return tx.job.create({ data: { ...data, dedupeKey: opts.dedupeKey } });
}

export type JobHandler = (job: Job) => Promise<void>;

const WORKER_ID = `${hostname()}:${process.pid}`;
const STUCK_AFTER_MS = 5 * 60 * 1000;

export function backoffMs(attempts: number): number {
  return Math.min(15_000 * 2 ** Math.max(0, attempts - 1), 30 * 60 * 1000);
}

/** Claims due jobs atomically. Safe to run in several processes at once. */
async function claim(limit: number, ids?: string[]): Promise<Job[]> {
  // Recover jobs whose worker died mid-run.
  await db.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
    data: { status: "FAILED", lockedAt: null, lockedBy: null, lastError: "Worker stopped while running the job" },
  });
  const idFilter = ids && ids.length > 0 ? ids : null;
  return db.$queryRaw<Job[]>`
    UPDATE "Job" SET "status" = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${WORKER_ID},
                     "attempts" = "attempts" + 1, "updatedAt" = now()
    WHERE "id" IN (
      SELECT "id" FROM "Job"
      WHERE "status" IN ('PENDING', 'FAILED') AND "runAt" <= now()
        AND (${idFilter}::text[] IS NULL OR "id" = ANY(${idFilter}::text[]))
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`;
}

async function finish(job: Job, err?: unknown) {
  if (!err) {
    await db.job.update({
      where: { id: job.id },
      data: { status: "SUCCEEDED", completedAt: new Date(), lockedAt: null, lockedBy: null, dedupeKey: null, lastError: null },
    });
    return;
  }
  if (err instanceof RetrySoon) {
    await db.job.update({
      where: { id: job.id },
      data: {
        status: "PENDING",
        attempts: { decrement: 1 },
        runAt: new Date(Date.now() + err.delayMs),
        lockedAt: null,
        lockedBy: null,
        lastError: err.message,
      },
    });
    return;
  }
  const message = errorMessage(err).slice(0, 1000);
  const dead = job.attempts >= job.maxAttempts;
  await db.job.update({
    where: { id: job.id },
    data: {
      status: dead ? "DEAD" : "FAILED",
      runAt: new Date(Date.now() + backoffMs(job.attempts)),
      lockedAt: null,
      lockedBy: null,
      lastError: message,
      // A dead job releases its key so a fresh attempt can be queued later (e.g. by reconciliation).
      ...(dead ? { dedupeKey: null } : {}),
    },
  });
  (dead ? log.error : log.warn)(dead ? "Job dead-lettered" : "Job failed, will retry", {
    jobId: job.id,
    type: job.type,
    attempts: job.attempts,
    error: message,
  });
}

/** Runs due jobs (optionally only the given ids). Returns the number processed. */
export async function runDueJobs(handlers: Partial<Record<JobType, JobHandler>>, opts: { limit?: number; ids?: string[] } = {}) {
  const jobs = await claim(opts.limit ?? 20, opts.ids);
  for (const job of jobs) {
    const handle = handlers[job.type as JobType];
    try {
      if (!handle) throw new Error(`No handler for job type ${job.type}`);
      await handle(job);
      await finish(job);
    } catch (err) {
      await finish(job, err);
    }
  }
  return jobs.length;
}

export async function retryDeadJob(id: string) {
  return db.job.update({
    where: { id },
    data: { status: "PENDING", attempts: 0, runAt: new Date(), lastError: null },
  });
}
