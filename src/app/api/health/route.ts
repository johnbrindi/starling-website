import { db } from "@/server/db";
import { handler, json } from "@/server/http";

/** GET /api/health — liveness for load balancers and uptime monitors. Reveals no configuration. */
export const GET = handler(async () => {
  try {
    await db.$queryRaw`SELECT 1`;
    return json({ ok: true, time: new Date().toISOString() });
  } catch {
    return json({ ok: false }, { status: 503 });
  }
});
