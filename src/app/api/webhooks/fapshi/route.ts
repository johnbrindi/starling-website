import { clientIp, handler, json } from "@/server/http";
import { handleWebhook } from "@/server/payments/service";
import { rateLimit } from "@/server/rate-limit";

/**
 * POST /api/webhooks/fapshi — Fapshi payment status changes. Authenticated by the x-wh-secret header
 * (FAPSHI_WEBHOOK_SECRET); the payment is then re-checked against the Fapshi API before access is granted.
 * Fapshi sends each event once and does not retry, so the page polling and reconciliation remain the safety net.
 */
export const POST = handler(async (req) => {
  await rateLimit(`webhook:${clientIp(req)}`, 120, 60);
  const raw = await req.text();
  if (raw.length > 64_000) return json({ ok: false }, { status: 413 });
  const res = await handleWebhook("FAPSHI", raw, req.headers);
  return json({ ok: res.accepted }, { status: res.accepted ? 200 : 401 });
});
