import { json, readJson } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { generateTickets, generateTicketsSchema } from "@/server/tickets";
import { runDueJobs } from "@/server/jobs/queue";
import { JOB_HANDLERS } from "@/server/jobs/tick";

/**
 * POST /api/admin/tickets — { packageId, count, batch, style, activationDays }.
 * Creates printed username/password tickets and pushes them to the router. Time starts at first login.
 */
export const POST = staffRoute("sales:create", async (req, staff) => {
  const res = await generateTickets(await readJson(req, generateTicketsSchema), staff.staff.id, staff.ip);
  await runDueJobs(JOB_HANDLERS, { limit: 50 }).catch(() => 0); // push to the router now; the worker retries failures
  return json(res, { status: 201 });
});
