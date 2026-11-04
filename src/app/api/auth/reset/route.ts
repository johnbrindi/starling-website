import { resetCustomerPassword, resetSchema } from "@/server/auth/customer";
import { assertSameOrigin, clientIp, handler, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

/**
 * POST /api/auth/reset — set a new password.
 * { method: "code", identifier, code, password }  (6-digit code from email or support)
 * { method: "wifi", identifier, wifiUsername, wifiPassword, password }  (any Wi-Fi login bought on this account)
 */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  await rateLimit(`reset:ip:${ip}`, 15, 900);
  const input = await readJson(req, resetSchema);
  await rateLimit(`reset:id:${"phone" in input.identifier ? input.identifier.phone : input.identifier.email}`, 8, 900);
  const customer = await resetCustomerPassword(input, { ip, userAgent: req.headers.get("user-agent") });
  return json({ ok: true, needsEmail: !customer.email });
});
