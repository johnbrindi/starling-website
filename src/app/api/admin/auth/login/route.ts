import { loginSchema, staffLogin } from "@/server/auth/staff";
import { assertSameOrigin, clientIp, handler, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

/** POST /api/admin/auth/login — { email, password }. Rate-limited; accounts lock after 5 failures. */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  await rateLimit(`staff-login:ip:${ip}`, 20, 900);
  const input = await readJson(req, loginSchema);
  await rateLimit(`staff-login:email:${input.email.toLowerCase()}`, 10, 900);
  const user = await staffLogin(input, { ip, userAgent: req.headers.get("user-agent") });
  return json({ ok: true, role: user.role });
});
