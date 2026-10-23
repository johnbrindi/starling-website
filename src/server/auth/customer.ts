import "server-only";
import { z } from "zod";
import { normalizeCameroonPhone } from "@/lib/phone";
import { db } from "../db";
import { audit } from "../audit";
import { AppError } from "../errors";
import { createSession } from "./session";

export const recoverSchema = z.object({
  phone: z.string().min(9).max(20),
  code: z.string().min(6).max(12),
});

/**
 * Lightweight customer sign-in without passwords or SMS: the phone number used for payment plus
 * any access code the customer received. Rate-limited by the caller (per IP and per phone).
 */
export async function recoverCustomerSession(input: z.infer<typeof recoverSchema>, meta: { ip: string; userAgent: string | null }) {
  const phone = normalizeCameroonPhone(input.phone);
  const code = input.code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const generic = new AppError("UNAUTHENTICATED", "The phone number and access code do not match.");
  if (!phone) throw generic;
  const customer = await db.customer.findUnique({ where: { phone } });
  const credential = await db.accessCredential.findUnique({ where: { username: code } });
  if (!customer || !credential || credential.customerId !== customer.id || customer.isBlocked) {
    await audit({ actorType: "CUSTOMER", action: "customer.recover_failed", ipAddress: meta.ip, metadata: { phoneKnown: !!customer } });
    throw generic;
  }
  await createSession("CUSTOMER", customer.id, { ipAddress: meta.ip, userAgent: meta.userAgent });
  await audit({ actorType: "CUSTOMER", actorId: customer.id, action: "customer.recovered", ipAddress: meta.ip });
  return customer;
}
