import { z } from "zod";
import { emailField, setCustomerEmail } from "@/server/auth/customer";
import { requireCustomer } from "@/server/auth/session";
import { assertSameOrigin, clientIp, handler, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

/** PUT /api/me/email — { email }: the email that receives password reset codes. */
export const PUT = handler(async (req) => {
  assertSameOrigin(req);
  const { customer } = await requireCustomer();
  await rateLimit(`email:${customer.id}`, 10, 3600);
  const { email } = await readJson(req, z.object({ email: emailField }));
  await setCustomerEmail(customer.id, email, clientIp(req));
  return json({ ok: true, email });
});
