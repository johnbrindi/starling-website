import { destroySession } from "@/server/auth/session";
import { assertSameOrigin, handler, json } from "@/server/http";

/** POST /api/me/logout — ends the customer session on this device (network access is not affected). */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  await destroySession("CUSTOMER");
  return json({ ok: true });
});
