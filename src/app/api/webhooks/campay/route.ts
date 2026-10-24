import { clientIp, handler, json } from "@/server/http";
import { handleWebhook } from "@/server/payments/service";
import { rateLimit } from "@/server/rate-limit";

/**
 * GET or POST /api/webhooks/campay — Campay payment callbacks (set as the app's Callback URL).
 * Authenticated by the JWT "signature" field signed with CAMPAY_WEBHOOK_KEY; the payment is then
 * re-checked against the Campay API before access is granted. Polling and reconciliation remain
 * the safety net if a callback is lost.
 */
async function receive(raw: string, req: Request) {
  await rateLimit(`webhook:${clientIp(req)}`, 120, 60);
  if (raw.length > 64_000) return json({ ok: false }, { status: 413 });
  const res = await handleWebhook("CAMPAY", raw, req.headers);
  return json({ ok: res.accepted }, { status: res.accepted ? 200 : 401 });
}

export const GET = handler(async (req) => receive(new URL(req.url).search.slice(1), req));

export const POST = handler(async (req) => {
  const body = await req.text();
  return receive(body.trim() ? body : new URL(req.url).search.slice(1), req);
});
