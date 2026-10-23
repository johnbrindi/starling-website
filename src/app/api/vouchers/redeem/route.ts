import { z } from "zod";
import { normalizeCameroonPhone } from "@/lib/phone";
import { createSession, getCustomer } from "@/server/auth/session";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { assertSameOrigin, clientIp, handler, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { redeemVoucher } from "@/server/subscriptions/service";
import { provisionNow } from "@/server/jobs/tick";

const schema = z.object({ code: z.string().min(8).max(20), phone: z.string().min(9).max(20) });

/** POST /api/vouchers/redeem — redeem a prepaid card { code, phone }. Idempotent per customer. */
export const POST = handler(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  await rateLimit(`voucher:ip:${ip}`, 8, 900);
  const input = await readJson(req, schema);
  const phone = normalizeCameroonPhone(input.phone);
  if (!phone) throw new AppError("VALIDATION_FAILED", "Enter a valid Cameroon mobile number.");
  await rateLimit(`voucher:phone:${phone}`, 8, 900);
  const customer = await db.customer.upsert({ where: { phone }, create: { phone }, update: { lastSeenAt: new Date() } });
  if (customer.isBlocked) throw new AppError("FORBIDDEN", "This number cannot redeem vouchers. Please contact support.");
  const result = await redeemVoucher(customer.id, input.code);
  await provisionNow(customer.id);
  const current = await getCustomer();
  if (current?.customer.id !== customer.id) await createSession("CUSTOMER", customer.id, { ipAddress: ip, userAgent: req.headers.get("user-agent") });
  return json({ ok: true, created: result.created });
});
