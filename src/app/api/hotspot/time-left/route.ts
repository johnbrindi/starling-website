import { db } from "@/server/db";
import { clientIp } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { isEntitled } from "@/server/subscriptions/service";

const HEADERS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store", "Content-Type": "application/json" };

/**
 * GET /api/hotspot/time-left?u=USERNAME — seconds left for a hotspot login, for the router's
 * status.html countdown (the router itself only knows its own uptime counters). Reveals nothing
 * but the remaining time of a random username; unknown/expired logins return 0.
 */
export async function GET(req: Request) {
  try {
    await rateLimit(`time-left:${clientIp(req)}`, 30, 60);
  } catch {
    return new Response(JSON.stringify({ secondsLeft: null }), { status: 429, headers: HEADERS });
  }
  const u = new URL(req.url).searchParams.get("u") ?? "";
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(u)) return new Response(JSON.stringify({ secondsLeft: 0 }), { headers: HEADERS });
  const c = await db.accessCredential.findUnique({ where: { username: u }, select: { status: true, validFrom: true, validUntil: true } });
  const now = new Date();
  const secondsLeft = c && isEntitled(c, now) ? Math.floor((c.validUntil.getTime() - now.getTime()) / 1000) : 0;
  return new Response(JSON.stringify({ secondsLeft }), { headers: HEADERS });
}
