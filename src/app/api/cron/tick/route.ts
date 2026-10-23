import { env } from "@/server/env";
import { safeEqual } from "@/server/crypto";
import { handler, json } from "@/server/http";
import { tick } from "@/server/jobs/tick";

/**
 * POST /api/cron/tick — runs one scheduler pass (expiry, jobs, reconciliation). For hosts that cannot
 * run the long-lived worker. Requires "Authorization: Bearer <CRON_SECRET>".
 */
export const POST = handler(async (req) => {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env().CRON_SECRET}`)) return json({ error: { code: "UNAUTHENTICATED", message: "Unauthorized" } }, { status: 401 });
  return json({ ok: true, results: await tick() });
});
