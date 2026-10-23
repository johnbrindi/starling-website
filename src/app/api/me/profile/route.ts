import { z } from "zod";
import { requireCustomer } from "@/server/auth/session";
import { db } from "@/server/db";
import { assertSameOrigin, handler, json, readJson } from "@/server/http";

/** GET /api/me/profile — the signed-in customer's profile. */
export const GET = handler(async () => {
  const { customer } = await requireCustomer();
  return json({ name: customer.name, phone: customer.phone, createdAt: customer.createdAt });
});

/** PATCH /api/me/profile — { name }. The phone number is the account identifier and cannot be changed here. */
export const PATCH = handler(async (req) => {
  assertSameOrigin(req);
  const { customer } = await requireCustomer();
  const { name } = await readJson(req, z.object({ name: z.string().trim().min(2, "Enter your full name.").max(60) }));
  await db.customer.update({ where: { id: customer.id }, data: { name } });
  return json({ ok: true, name });
});
