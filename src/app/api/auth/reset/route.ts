import { resetCustomerPassword, resetSchema } from "@/server/auth/customer";
import { assertSameOrigin, clientIp, handler, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

/** POST /api/auth/reset — { phone, proof, password }. proof = support reset code or any access code received. */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  await rateLimit(`reset:ip:${ip}`, 10, 900);
  const input = await readJson(req, resetSchema);
  await rateLimit(`reset:phone:${input.phone}`, 5, 900);
  await resetCustomerPassword(input, { ip, userAgent: req.headers.get("user-agent") });
  return json({ ok: true });
});
