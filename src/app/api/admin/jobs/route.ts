import { db } from "@/server/db";
import { json } from "@/server/http";
import { staffRoute } from "@/server/admin/route";

/** GET /api/admin/jobs — failing and dead-lettered background jobs (sync errors). */
export const GET = staffRoute("network:view", async () =>
  json({ jobs: await db.job.findMany({ where: { status: { in: ["FAILED", "DEAD", "PENDING", "RUNNING"] } }, orderBy: { updatedAt: "desc" }, take: 100 }) }),
);
