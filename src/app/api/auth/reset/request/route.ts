import { requestPasswordResetCode, resetRequestSchema } from "@/server/auth/customer";
import { assertSameOrigin, clientIp, handler, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

/** POST /api/auth/reset/request — { identifier: phone or email } → emails a 6-digit code to the account's email. */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  await rateLimit(`reset-request:ip:${ip}`, 10, 900);
  const input = await readJson(req, resetRequestSchema);
  await rateLimit(`reset-request:id:${"phone" in input.identifier ? input.identifier.phone : input.identifier.email}`, 3, 900);
  return json(await requestPasswordResetCode(input, { ip, userAgent: req.headers.get("user-agent") }));
});
