import "server-only";
import { z } from "zod";
import { normalizeCameroonPhone } from "@/lib/phone";
import { db } from "../db";
import { audit } from "../audit";
import { randomCode, sha256 } from "../crypto";
import { AppError } from "../errors";
import { createSession } from "./session";
import { mailConfigured, sendMail } from "../mail";
import { credentialPassword } from "../subscriptions/service";
import { getDummyHash, hashPassword, verifyPassword } from "./password";

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const RESET_CODE_TTL_MS = 30 * 60 * 1000;
const EMAIL_CODE_TTL_MS = 15 * 60 * 1000;
const MAX_RESET_ATTEMPTS = 5;

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

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email, e.g. name@gmail.com.").max(120, "Email is too long."));

const samePasswords = (d: { password: string; confirmPassword: string }) => d.password === d.confirmPassword;
const mismatch = { path: ["confirmPassword"], message: "The two passwords are not the same." };

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name.").max(60, "Name is too long."),
    phone: phoneField,
    /** Only used to send a reset code if the password is forgotten. */
    email: emailField,
    password: customerPasswordSchema,
    confirmPassword: z.string().max(128),
  })
  .refine(samePasswords, mismatch);

/** Phone number or email, whichever the customer remembers. */
const identifierField = z
  .string()
  .trim()
  .min(3, "Enter your phone number or email.")
  .max(120)
  .transform((v, ctx) => {
    if (v.includes("@")) {
      const e = emailField.safeParse(v);
      if (e.success) return { email: e.data } as const;
    } else {
      const p = normalizeCameroonPhone(v);
      if (p) return { phone: p } as const;
    }
    ctx.addIssue({ code: "custom", message: "Enter your phone number (6 70 00 00 00) or your email." });
    return z.NEVER;
  });

export const resetRequestSchema = z.object({ identifier: identifierField });

export const loginSchema = z.object({ phone: phoneField, password: z.string().min(1, "Enter your password.").max(128) });

export const resetSchema = z
  .discriminatedUnion("method", [
  /** 6-digit code sent by email or given by Juthelink support. */
  z.object({ method: z.literal("code"), identifier: identifierField, code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."), password: customerPasswordSchema, confirmPassword: z.string().max(128) }),
  /** Username and password of any Wi-Fi login this customer bought. */
  z.object({
    method: z.literal("wifi"),
    identifier: identifierField,
    wifiUsername: z.string().trim().min(3, "Enter the Wi-Fi username.").max(40),
    wifiPassword: z.string().trim().min(3, "Enter the Wi-Fi password.").max(40),
    password: customerPasswordSchema,
    confirmPassword: z.string().max(128),
  }),
  ])
  .refine(samePasswords, mismatch);

async function findByIdentifier(id: { phone: string } | { email: string }) {
  return "phone" in id ? db.customer.findUnique({ where: { phone: id.phone } }) : db.customer.findUnique({ where: { email: id.email } });
}

/** j***n@gmail.com: enough for the customer to recognise it, not enough to harvest. */
export function maskEmail(email: string) {
  const [user = "", domain = ""] = email.split("@");
  const shown = user.length <= 2 ? user[0] ?? "" : `${user[0]}${"*".repeat(Math.min(5, user.length - 2))}${user[user.length - 1]}`;
  return `${shown}@${domain}`;
}

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
  if (await db.customer.findUnique({ where: { email: input.email }, select: { id: true } })) {
    throw new AppError("CONFLICT", "This email is already used by another account.", [{ path: "email", message: "Already used. Use another email or sign in." }]);
  }
  const customer = await db.customer.create({
    data: { phone: input.phone, name: input.name, email: input.email, passwordHash: await hashPassword(input.password), passwordChangedAt: new Date() },
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
 * Step 1 of "Forgot password": emails a 6-digit code (valid 15 minutes) to the account's email.
 * Tells the customer plainly what happened so nobody is left guessing.
 */
export async function requestPasswordResetCode(input: z.infer<typeof resetRequestSchema>, meta: Meta) {
  const customer = await findByIdentifier(input.identifier);
  if (!customer || customer.isBlocked) {
    return { sent: false as const, reason: "not-found" as const };
  }
  if (!customer.email) return { sent: false as const, reason: "no-email" as const };
  if (!mailConfigured()) return { sent: false as const, reason: "unavailable" as const };
  const code = randomCode(6, "0123456789");
  await db.customer.update({
    where: { id: customer.id },
    data: { resetCodeHash: sha256(`reset:${customer.id}:${code}`), resetCodeExpiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS), resetAttempts: 0 },
  });
  const name = customer.name?.split(" ")[0] ?? "there";
  await sendMail(
    customer.email,
    `Your Juthelink code: ${code}`,
    `Hello ${name},\n\nYour code to reset your Juthelink password is: ${code}\n\nIt is valid for 15 minutes. If you did not ask for it, ignore this email: your password stays the same.\n\nJuthelink Wi-Fi`,
    `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:16px;color:#16181d">
      <h2 style="color:#1d5bd8;margin:0 0 12px">Juthelink</h2>
      <p>Hello ${name.replace(/[<>&"]/g, "")},</p>
      <p>Your code to reset your Juthelink password is:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;font-family:monospace;background:#f5f6f8;padding:12px;text-align:center;border-radius:8px">${code}</p>
      <p style="color:#6b7180;font-size:13px">Valid for 15 minutes. If you did not ask for it, ignore this email: your password stays the same.</p>
    </div>`,
  );
  await audit({ actorType: "CUSTOMER", actorId: customer.id, action: "customer.reset_code_emailed", ipAddress: meta.ip });
  return { sent: true as const, to: maskEmail(customer.email) };
}

/**
 * Step 2: sets a new password after proving ownership with either the 6-digit code (email or
 * support) or the username + password of a Wi-Fi login this customer bought.
 */
export async function resetCustomerPassword(input: z.infer<typeof resetSchema>, meta: Meta) {
  const generic = new AppError("UNAUTHENTICATED", input.method === "code" ? "That code is not correct or has expired." : "That Wi-Fi username and password do not match this account.");
  const customer = await findByIdentifier(input.identifier);
  if (!customer || customer.isBlocked) throw new AppError("UNAUTHENTICATED", "No account found for that phone number or email.");
  let ok = false;
  if (input.method === "code") {
    const live = customer.resetCodeHash && customer.resetCodeExpiresAt && customer.resetCodeExpiresAt > new Date() && customer.resetAttempts < MAX_RESET_ATTEMPTS;
    ok = Boolean(live) && customer.resetCodeHash === sha256(`reset:${customer.id}:${input.code}`);
    if (!ok && customer.resetCodeHash) {
      const attempts = customer.resetAttempts + 1;
      await db.customer.update({
        where: { id: customer.id },
        data: attempts >= MAX_RESET_ATTEMPTS ? { resetAttempts: attempts, resetCodeHash: null, resetCodeExpiresAt: null } : { resetAttempts: attempts },
      });
      if (attempts >= MAX_RESET_ATTEMPTS) {
        await audit({ actorType: "CUSTOMER", actorId: customer.id, action: "customer.reset_failed", ipAddress: meta.ip, metadata: { cancelled: true } });
        throw new AppError("UNAUTHENTICATED", "Too many wrong codes. Ask for a new code.");
      }
    }
  } else {
    const user = input.wifiUsername.replace(/\s+/g, "");
    const creds = await db.accessCredential.findMany({ where: { customerId: customer.id, username: { in: [user, user.toLowerCase(), user.toUpperCase()] } } });
    ok = creds.some((c) => credentialPassword(c) === input.wifiPassword.replace(/\s+/g, ""));
  }
  if (!ok) {
    await audit({ actorType: "CUSTOMER", actorId: customer.id, action: "customer.reset_failed", ipAddress: meta.ip, metadata: { method: input.method } });
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
      resetAttempts: 0,
    },
  });
  await db.session.deleteMany({ where: { customerId: customer.id } }); // sign out everywhere else
  await createSession("CUSTOMER", customer.id, { ipAddress: meta.ip, userAgent: meta.userAgent });
  await audit({ actorType: "CUSTOMER", actorId: customer.id, action: "customer.password_reset", ipAddress: meta.ip, metadata: { method: input.method } });
  return customer;
}

/** Signed-in customer adds or changes the email used for password resets. */
export async function setCustomerEmail(customerId: string, email: string, ip: string) {
  const taken = await db.customer.findUnique({ where: { email }, select: { id: true } });
  if (taken && taken.id !== customerId) throw new AppError("CONFLICT", "This email is already used by another account.", [{ path: "email", message: "Already used." }]);
  await db.customer.update({ where: { id: customerId }, data: { email } });
  await audit({ actorType: "CUSTOMER", actorId: customerId, action: "customer.email_set", ipAddress: ip });
}

export const changePasswordSchema = z
  .object({ current: z.string().min(1).max(128), password: customerPasswordSchema, confirmPassword: z.string().max(128) })
  .refine(samePasswords, mismatch);

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
    data: { resetCodeHash: sha256(`reset:${customerId}:${code}`), resetCodeExpiresAt: new Date(Date.now() + RESET_CODE_TTL_MS), resetAttempts: 0 },
  });
  await audit({ actorType: "STAFF", actorId: staffId, action: "customer.reset_code_issued", targetType: "Customer", targetId: customerId, ipAddress: ip });
  return code;
}
