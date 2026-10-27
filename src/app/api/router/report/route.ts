import { env } from "@/server/env";
import { safeEqual } from "@/server/crypto";
import { errorResponse, clientIp } from "@/server/http";
import { applyRouterReport } from "@/server/network/report";
import { rateLimit } from "@/server/rate-limit";

/**
 * POST /api/router/report?key=ROUTER_PULL_KEY — the router's list of logged-in devices (body: one
 * line per device, see parseRouterReport). Sent every ~30 s by the "juthelink-report" scheduler.
 */
export async function POST(req: Request) {
  try {
    const e = env();
    const key = new URL(req.url).searchParams.get("key") ?? "";
    if (e.NETWORK_ADAPTER !== "routerpull" || !e.ROUTER_PULL_KEY || !safeEqual(key, e.ROUTER_PULL_KEY)) {
      return new Response("forbidden\n", { status: 403, headers: { "Content-Type": "text/plain" } });
    }
    await rateLimit(`router-report:${clientIp(req)}`, 30, 60);
    const body = (await req.text()).slice(0, 100_000);
    const r = await applyRouterReport(body);
    return new Response(`ok ${r.devices}\n`, { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
