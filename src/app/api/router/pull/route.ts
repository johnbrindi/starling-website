import { after } from "next/server";
import { env } from "@/server/env";
import { safeEqual } from "@/server/crypto";
import { errorResponse, clientIp } from "@/server/http";
import { recordRouterCheckIn, routerPull } from "@/server/network/pull";
import { rateLimit } from "@/server/rate-limit";
import { tick } from "@/server/jobs/tick";
import { log, errorMessage } from "@/server/logger";

/**
 * GET /api/router/pull?key=ROUTER_PULL_KEY&ok=user1.user2
 * Called by the MikroTik scheduler (network/mikrotik/standalone/juthelink-sync.rsc) every ~10 s.
 * Returns plain text: "a,user,password,profile,phone" or "d,user" per line. Also drives the
 * background maintenance (expiry, payment reconciliation) so no separate cron is needed.
 */
export async function GET(req: Request) {
  try {
    const e = env();
    const url = new URL(req.url);
    const key = url.searchParams.get("key") ?? "";
    if (e.NETWORK_ADAPTER !== "routerpull" || !e.ROUTER_PULL_KEY || !safeEqual(key, e.ROUTER_PULL_KEY)) {
      return new Response("forbidden\n", { status: 403, headers: { "Content-Type": "text/plain" } });
    }
    await rateLimit(`router-pull:${clientIp(req)}`, 60, 60);
    const ok = (url.searchParams.get("ok") ?? "").split(".").filter(Boolean);
    const res = await routerPull(ok);
    await recordRouterCheckIn({ confirmed: res.confirmed, adds: res.adds, deletes: res.deletes, ip: clientIp(req) });
    after(async () => {
      try {
        await tick();
      } catch (err) {
        log.warn("Maintenance after router pull failed", { error: errorMessage(err) });
      }
    });
    return new Response(res.body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
