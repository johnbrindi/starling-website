import { loginCustomer, loginSchema } from "@/server/auth/customer";
import { assertSameOrigin, clientIp, handler, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

/** POST /api/auth/login — { phone, password }. Locks the account for 15 min after 5 failures. */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  await rateLimit(`login:ip:${ip}`, 20, 900);
  const input = await readJson(req, loginSchema);
  await rateLimit(`login:phone:${input.phone}`, 10, 900);
  const customer = await loginCustomer(input, { ip, userAgent: req.headers.get("user-agent") });
  return json({ ok: true, name: customer.name });
});
