import { z } from "zod";
import { requireCustomer } from "@/server/auth/session";
import { assertSameOrigin, clientIp, handler, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { redeemVoucher } from "@/server/subscriptions/service";
import { provisionNow } from "@/server/jobs/tick";

/** POST /api/vouchers/redeem — { code }. Adds a prepaid card to the signed-in account. Idempotent per customer. */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const { customer } = await requireCustomer();
  await rateLimit(`voucher:ip:${clientIp(req)}`, 8, 900);
  await rateLimit(`voucher:customer:${customer.id}`, 8, 900);
  const { code } = await readJson(req, z.object({ code: z.string().trim().min(8, "Enter the code printed on the card.").max(20) }));
  const result = await redeemVoucher(customer.id, code);
  await provisionNow(customer.id);
  return json({ ok: true, created: result.created });
});
