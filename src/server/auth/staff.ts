import "server-only";
import { z } from "zod";
import type { StaffRole } from "@/generated/prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { randomToken, sha256 } from "../crypto";
import { AppError } from "../errors";
import { createSession } from "./session";
import { getDummyHash, hashPassword, passwordSchema, verifyPassword } from "./password";

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

export const loginSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
});

export async function staffLogin(input: z.infer<typeof loginSchema>, meta: { ip: string; userAgent: string | null }) {
  const email = input.email.trim().toLowerCase();
  const user = await db.staffUser.findUnique({ where: { email } });
  const invalid = new AppError("UNAUTHENTICATED", "Incorrect email or password.");
  if (!user) {
    await verifyPassword(await getDummyHash(), input.password); // equalise timing
    await audit({ actorType: "STAFF", action: "staff.login_failed", ipAddress: meta.ip, metadata: { reason: "unknown-email" } });
    throw invalid;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError("RATE_LIMITED", "Too many failed attempts. The account is locked for 15 minutes.");
  }
  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok || !user.isActive) {
    const failed = user.failedLoginCount + 1;
    await db.staffUser.update({
      where: { id: user.id },
      data: { failedLoginCount: failed >= MAX_FAILED ? 0 : failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MS) : null },
    });
    await audit({ actorType: "STAFF", actorId: user.id, action: "staff.login_failed", ipAddress: meta.ip, metadata: { locked: failed >= MAX_FAILED, inactive: !user.isActive } });
    throw invalid;
  }
  await db.staffUser.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await createSession("STAFF", user.id, meta);
  await audit({ actorType: "STAFF", actorId: user.id, action: "staff.login", ipAddress: meta.ip });
  return user;
}

export const createStaffSchema = z.object({
  email: z.email().max(200),
  name: z.string().trim().min(2).max(80),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "SUPPORT", "VIEWER"]),
  password: passwordSchema,
});

export async function createStaff(input: z.infer<typeof createStaffSchema>, actorId: string | null) {
  const email = input.email.trim().toLowerCase();
  if (await db.staffUser.findUnique({ where: { email } })) throw new AppError("CONFLICT", "A staff account with this email already exists.");
  const user = await db.staffUser.create({
    data: { email, name: input.name, role: input.role, passwordHash: await hashPassword(input.password) },
  });
  await audit({ actorType: actorId ? "STAFF" : "SYSTEM", actorId, action: "staff.created", targetType: "StaffUser", targetId: user.id, metadata: { role: input.role } });
  return user;
}

export const updateStaffSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "ADMIN", "SUPPORT", "VIEWER"]).optional(),
  isActive: z.boolean().optional(),
  name: z.string().trim().min(2).max(80).optional(),
});

/** Role changes are SUPER_ADMIN-only (enforced by the caller's permission) and cannot lock everyone out. */
export async function updateStaff(targetId: string, patch: z.infer<typeof updateStaffSchema>, actor: { id: string; role: StaffRole }, ip?: string) {
  const target = await db.staffUser.findUnique({ where: { id: targetId } });
  if (!target) throw new AppError("NOT_FOUND", "Staff account not found.");
  if (actor.role !== "SUPER_ADMIN") throw new AppError("FORBIDDEN", "Only a super admin can change staff accounts.");
  if (target.id === actor.id && (patch.role && patch.role !== target.role || patch.isActive === false)) {
    throw new AppError("FORBIDDEN", "You cannot change your own role or deactivate yourself.");
  }
  const losingSuper = target.role === "SUPER_ADMIN" && ((patch.role && patch.role !== "SUPER_ADMIN") || patch.isActive === false);
  if (losingSuper) {
    const supers = await db.staffUser.count({ where: { role: "SUPER_ADMIN", isActive: true } });
    if (supers <= 1) throw new AppError("CONFLICT", "At least one active super admin must remain.");
  }
  const updated = await db.staffUser.update({ where: { id: targetId }, data: patch });
  if (patch.role || patch.isActive === false) await db.session.deleteMany({ where: { staffId: targetId } });
  await audit({ actorType: "STAFF", actorId: actor.id, action: "staff.updated", targetType: "StaffUser", targetId, ipAddress: ip, metadata: { ...patch, previousRole: target.role } });
  return updated;
}

/** Creates a single-use reset link (valid 1 hour). Delivered out-of-band by a super admin or CLI. */
export async function createPasswordReset(staffId: string, actorId: string | null) {
  const token = randomToken(32);
  await db.passwordResetToken.deleteMany({ where: { staffId, usedAt: null } });
  await db.passwordResetToken.create({ data: { staffId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) } });
  await audit({ actorType: actorId ? "STAFF" : "SYSTEM", actorId, action: "staff.password_reset_issued", targetType: "StaffUser", targetId: staffId });
  return token;
}

export const resetSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });

export async function resetPassword(input: z.infer<typeof resetSchema>, ip: string) {
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(input.token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) throw new AppError("BAD_REQUEST", "This reset link is invalid or has expired.");
  const claimed = await db.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count === 0) throw new AppError("BAD_REQUEST", "This reset link has already been used.");
  await db.staffUser.update({
    where: { id: row.staffId },
    data: { passwordHash: await hashPassword(input.password), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  });
  await db.session.deleteMany({ where: { staffId: row.staffId } });
  await audit({ actorType: "STAFF", actorId: row.staffId, action: "staff.password_reset", ipAddress: ip });
}
