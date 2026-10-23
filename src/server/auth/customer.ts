import "server-only";
import { z } from "zod";
import { normalizeCameroonPhone } from "@/lib/phone";
import { db } from "../db";
import { audit } from "../audit";
import { randomCode, sha256 } from "../crypto";
import { AppError } from "../errors";
import { createSession } from "./session";
import { getDummyHash, hashPassword, verifyPassword } from "./password";

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const RESET_CODE_TTL_MS = 30 * 60 * 1000;

/** Customer passwords: long enough to resist guessing, short enough to type on a phone. */
export const customerPasswordSchema = z.string().min(8, "Use at least 8 characters.").max(128, "Too long.");

const phoneField = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const p = normalizeCameroonPhone(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "Enter a Cameroon mobile number, e.g. 6 70 00 00 00." });
      return z.NEVER;
    }
    return p;
  });

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(60, "Name is too long."),
  phone: phoneField,
  password: customerPasswordSchema,
});

export const loginSchema = z.object({ phone: phoneField, password: z.string().min(1, "Enter your password.").max(128) });

export const resetSchema = z.object({
  phone: phoneField,
  /** Either a 6-digit reset code from support, or any Wi-Fi access code this customer received. */
  proof: z.string().trim().min(6, "Enter the code.").max(20),
  password: customerPasswordSchema,
});

interface Meta {
  ip: string;
  userAgent: string | null;
}

export async function registerCustomer(input: z.infer<typeof registerSchema>, meta: Meta) {
  const existing = await db.customer.findUnique({ where: { phone: input.phone } });
  if (existing?.passwordHash) {
    throw new AppError("CONFLICT", "An account already exists for this number. Sign in instead.", [{ path: "phone", message: "Already registered. Sign in instead." }]);
  }
  if (existing) {
    // Purchases were made with this number before accounts existed: ownership must be proven first.
    throw new AppError(
      "CONFLICT",
      "This number already has purchases. Use “Forgot password” with one of your access codes to set a password.",
      [{ path: "phone", message: "This number already has purchases. Use “Forgot password”." }],
    );
  }
  const customer = await db.customer.create({
    data: { phone: input.phone, name: input.name, passwordHash: await hashPassword(input.password), passwordChangedAt: new Date() },
  });
  await createSession("CUSTOMER", customer.id, { ipAddress: meta.ip, userAgent: meta.userAgent });
  await audit({ actorType: "CUSTOMER", actorId: customer.id, action: "customer.registered", ipAddress: meta.ip });
  return customer;
}

export async function loginCustomer(input: z.infer<typeof loginSchema>, meta: Meta) {
  const invalid = new AppError("UNAUTHENTICATED", "Wrong phone number or password.");
  const customer = await db.customer.findUnique({ where: { phone: input.phone } });
  if (!customer?.passwordHash) {
    await verifyPassword(await getDummyHash(), input.password); // same timing whether or not the account exists
    if (customer) throw new AppError("UNAUTHENTICATED", "No password is set for this number yet. Use “Forgot password” to create one.");
    throw invalid;
  }
  if (customer.lockedUntil && customer.lockedUntil > new Date()) {
    throw new AppError("RATE_LIMITED", "Too many wrong passwords. Try again in 15 minutes or reset your password.");
  }
  if (!(await verifyPassword(customer.passwordHash, input.password))) {
    const failed = customer.failedLoginCount + 1;
    await db.customer.update({
      where: { id: customer.id },
      data: { failedLoginCount: failed >= MAX_FAILED ? 0 : failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MS) : null },
    });
    await audit({ actorType: "CUSTOMER", actorId: customer.id, action: "customer.login_failed", ipAddress: meta.ip, metadata: { locked: failed >= MAX_FAILED } });
    throw invalid;
  }
  if (customer.isBlocked) throw new AppError("FORBIDDEN", "This account is suspended. Please contact support.");
  await db.customer.update({ where: { id: customer.id }, data: { failedLoginCount: 0, lockedUntil: null, lastSeenAt: new Date() } });
  await createSession("CUSTOMER", customer.id, { ipAddress: meta.ip, userAgent: meta.userAgent });
  await audit({ actorType: "CUSTOMER", actorId: customer.id, action: "customer.login", ipAddress: meta.ip });
  return customer;
}

/**
 * Sets a new password after proving ownership of the number with either a staff-issued reset code
 * or any access code previously delivered to this customer (both were only ever shown to them).
 */
export async function resetCustomerPassword(input: z.infer<typeof resetSchema>, meta: Meta) {
  const generic = new AppError("UNAUTHENTICATED", "That phone number and code do not match.");
  const customer = await db.customer.findUnique({ where: { phone: input.phone } });
  if (!customer || customer.isBlocked) throw generic;
  const proof = input.proof.toUpperCase().replace(/[^A-Z0-9]/g, "");
  let ok = false;
  if (/^\d{6}$/.test(proof) && customer.resetCodeHash && customer.resetCodeExpiresAt && customer.resetCodeExpiresAt > new Date()) {
    ok = customer.resetCodeHash === sha256(`reset:${customer.id}:${proof}`);
  }
  if (!ok) {
    const cred = await db.accessCredential.findUnique({ where: { username: proof }, select: { customerId: true } });
    ok = cred?.customerId === customer.id;
  }
  if (!ok) {
    await audit({ actorType: "CUSTOMER", actorId: customer.id, action: "customer.reset_failed", ipAddress: meta.ip });
    throw generic;
  }
  await db.customer.update({
    where: { id: customer.id },
    data: {
      passwordHash: await hashPassword(input.password),
      passwordChangedAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
      resetCodeHash: null,
      resetCodeExpiresAt: null,
    },
  });
  await db.session.deleteMany({ where: { customerId: customer.id } }); // sign out everywhere else
  await createSession("CUSTOMER", customer.id, { ipAddress: meta.ip, userAgent: meta.userAgent });
  await audit({ actorType: "CUSTOMER", actorId: customer.id, action: "customer.password_reset", ipAddress: meta.ip });
}

export const changePasswordSchema = z.object({ current: z.string().min(1).max(128), password: customerPasswordSchema });

export async function changeCustomerPassword(customerId: string, input: z.infer<typeof changePasswordSchema>, sessionId: string, ip: string) {
  const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (!customer.passwordHash || !(await verifyPassword(customer.passwordHash, input.current))) {
    throw new AppError("UNAUTHENTICATED", "Your current password is not correct.", [{ path: "current", message: "Not correct." }]);
  }
  await db.customer.update({ where: { id: customerId }, data: { passwordHash: await hashPassword(input.password), passwordChangedAt: new Date() } });
  await db.session.deleteMany({ where: { customerId, id: { not: sessionId } } });
  await audit({ actorType: "CUSTOMER", actorId: customerId, action: "customer.password_changed", ipAddress: ip });
}

/** Staff: issue a 6-digit one-time reset code (valid 30 minutes) to read to the customer. */
export async function issueCustomerResetCode(customerId: string, staffId: string, ip?: string) {
  const code = randomCode(6, "0123456789");
  await db.customer.update({
    where: { id: customerId },
    data: { resetCodeHash: sha256(`reset:${customerId}:${code}`), resetCodeExpiresAt: new Date(Date.now() + RESET_CODE_TTL_MS) },
  });
  await audit({ actorType: "STAFF", actorId: staffId, action: "customer.reset_code_issued", targetType: "Customer", targetId: customerId, ipAddress: ip });
  return code;
}
