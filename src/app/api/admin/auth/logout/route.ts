import { destroySession } from "@/server/auth/session";
import { assertSameOrigin, handler, json } from "@/server/http";

/** POST /api/admin/auth/logout */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  await destroySession("STAFF");
  return json({ ok: true });
});
