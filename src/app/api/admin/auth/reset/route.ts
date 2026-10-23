import { resetPassword, resetSchema } from "@/server/auth/staff";
import { assertSameOrigin, clientIp, handler, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

/** POST /api/admin/auth/reset — { token, password } from a single-use reset link. */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  await rateLimit(`reset:ip:${ip}`, 10, 900);
  await resetPassword(await readJson(req, resetSchema), ip);
  return json({ ok: true });
});
