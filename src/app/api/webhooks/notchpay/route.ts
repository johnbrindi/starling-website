import { clientIp, handler, json } from "@/server/http";
import { handleWebhook } from "@/server/payments/service";
import { rateLimit } from "@/server/rate-limit";

/**
 * POST /api/webhooks/notchpay — Notch Pay events. Verified with x-notch-signature
 * (HMAC-SHA256 of the raw body), stored once per event id, then the payment is re-checked
 * against the Notch Pay API before any access is granted.
 */
export const POST = handler(async (req) => {
  await rateLimit(`webhook:${clientIp(req)}`, 120, 60);
  const raw = await req.text();
  if (raw.length > 64_000) return json({ ok: false }, { status: 413 });
  const res = await handleWebhook("NOTCHPAY", raw, req.headers);
  return json({ ok: res.accepted }, { status: res.accepted ? 200 : 401 });
});
