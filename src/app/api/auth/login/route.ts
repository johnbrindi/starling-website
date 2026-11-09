import { loginCustomer, loginSchema } from "@/server/auth/customer";
import { assertSameOrigin, clientIp, handler, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

/** POST /api/auth/login — { identifier (email, or phone for older accounts), password }. Locks the account for 15 min after 5 failures. */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  await rateLimit(`login:ip:${ip}`, 20, 900);
  const input = await readJson(req, loginSchema);
  await rateLimit(`login:id:${"phone" in input.identifier ? input.identifier.phone : input.identifier.email}`, 10, 900);
  const customer = await loginCustomer(input, { ip, userAgent: req.headers.get("user-agent") });
  // Accounts created before emails were asked for: the app then asks for one (for password resets).
  return json({ ok: true, name: customer.name, needsEmail: !customer.email });
});
