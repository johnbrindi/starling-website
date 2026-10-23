import { changeCustomerPassword, changePasswordSchema } from "@/server/auth/customer";
import { requireCustomer } from "@/server/auth/session";
import { assertSameOrigin, clientIp, handler, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

/** POST /api/me/password — { current, password }. Signs out other devices. */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const ctx = await requireCustomer();
  await rateLimit(`pwchange:${ctx.customer.id}`, 5, 900);
  await changeCustomerPassword(ctx.customer.id, await readJson(req, changePasswordSchema), ctx.sessionId, clientIp(req));
  return json({ ok: true });
});
