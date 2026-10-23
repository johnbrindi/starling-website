import { registerCustomer, registerSchema } from "@/server/auth/customer";
import { assertSameOrigin, clientIp, handler, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

/** POST /api/auth/register — { name, phone, password }. Creates the account and signs it in. */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  await rateLimit(`register:ip:${ip}`, 10, 3600);
  const input = await readJson(req, registerSchema);
  const customer = await registerCustomer(input, { ip, userAgent: req.headers.get("user-agent") });
  return json({ ok: true, name: customer.name }, { status: 201 });
});
