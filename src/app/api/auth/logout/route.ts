import { destroySession } from "@/server/auth/session";
import { assertSameOrigin, handler, json } from "@/server/http";

/** POST /api/auth/logout — signs out of the website on this device (Wi-Fi access is not affected). */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  await destroySession("CUSTOMER");
  return json({ ok: true });
});
