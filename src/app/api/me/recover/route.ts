import { recoverCustomerSession, recoverSchema } from "@/server/auth/customer";
import { assertSameOrigin, clientIp, handler, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

/** POST /api/me/recover — sign back in with { phone, code } (any access code previously issued). */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  await rateLimit(`recover:ip:${ip}`, 10, 900);
  const input = await readJson(req, recoverSchema);
  await rateLimit(`recover:phone:${input.phone.replace(/\D/g, "").slice(-9)}`, 5, 900);
  await recoverCustomerSession(input, { ip, userAgent: req.headers.get("user-agent") });
  return json({ ok: true });
});
