/**
 * Background worker: expiry, provisioning retries, payment reconciliation, router session sync,
 * notifications. Run one (or more) alongside the web app:  npm run worker
 * Every task is idempotent, so several workers or the /api/cron/tick endpoint can run concurrently.
 */
import "dotenv/config";
import { env } from "@/server/env";
import { tick } from "@/server/jobs/tick";
import { db } from "@/server/db";
import { log, errorMessage } from "@/server/logger";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 5000);
let stopping = false;

async function main() {
  const e = env(); // fail fast on bad configuration (e.g. simulator in production)
  log.info("Worker started", { network: e.NETWORK_ADAPTER, payments: e.PAYMENT_PROVIDER, intervalMs: INTERVAL_MS });
  while (!stopping) {
    const started = Date.now();
    try {
      const results = await tick();
      const errors = Object.entries(results).filter(([, r]) => r !== "ok");
      if (errors.length) log.warn("Tick finished with errors", Object.fromEntries(errors));
    } catch (err) {
      log.error("Tick crashed", { error: errorMessage(err) });
    }
    const wait = Math.max(500, INTERVAL_MS - (Date.now() - started));
    await new Promise((r) => setTimeout(r, wait));
  }
  await db.$disconnect();
  log.info("Worker stopped");
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopping = true;
  });
}

main().catch((err) => {
  console.error(errorMessage(err));
  process.exit(1);
});
