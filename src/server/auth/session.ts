import "server-only";
import { cookies } from "next/headers";
import type { Customer, StaffUser, SessionKind } from "@/generated/prisma/client";
import { db } from "../db";
import { env } from "../env";
import { randomToken, sha256 } from "../crypto";
import { AppError } from "../errors";
import { can, type Permission } from "./rbac";

const CUSTOMER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const STAFF_TTL_MS = 12 * 60 * 60 * 1000;
const STAFF_IDLE_MS = 2 * 60 * 60 * 1000;

function cookieName(kind: SessionKind) {
  const secure = env().NODE_ENV === "production";
  const base = kind === "STAFF" ? "sw_staff" : "sw_customer";
  // __Host- cookies are bound to this exact origin over HTTPS (no Domain, Path=/).
  return secure ? `__Host-${base}` : base;
}

export interface SessionMeta {
  ipAddress?: string;
  userAgent?: string | null;
}

export async function createSession(kind: SessionKind, subjectId: string, meta: SessionMeta = {}) {
  const token = randomToken(32);
  const ttl = kind === "STAFF" ? STAFF_TTL_MS : CUSTOMER_TTL_MS;
  const session = await db.session.create({
    data: {
      tokenHash: sha256(token),
      kind,
      staffId: kind === "STAFF" ? subjectId : null,
      customerId: kind === "CUSTOMER" ? subjectId : null,
      csrfToken: randomToken(24),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent?.slice(0, 300),
      expiresAt: new Date(Date.now() + ttl),
    },
  });
  const jar = await cookies();
  jar.set(cookieName(kind), token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    // Lax for customers so the session survives the captive-portal redirect; Strict for staff.
    sameSite: kind === "STAFF" ? "strict" : "lax",
    path: "/",
    maxAge: Math.floor(ttl / 1000),
  });
  return session;
}

async function readSession(kind: SessionKind) {
  const jar = await cookies();
  const token = jar.get(cookieName(kind))?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { staff: true, customer: true },
  });
  if (!session || session.kind !== kind) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) return null;
  if (kind === "STAFF" && now - session.lastUsedAt.getTime() > STAFF_IDLE_MS) return null;
  // Touch at most once a minute to limit writes.
  if (now - session.lastUsedAt.getTime() > 60_000) {
    await db.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  return session;
}

export async function destroySession(kind: SessionKind) {
  const jar = await cookies();
  const name = cookieName(kind);
  const token = jar.get(name)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(name);
}

export interface StaffContext {
  sessionId: string;
  csrfToken: string;
  staff: StaffUser;
}

export async function getStaff(): Promise<StaffContext | null> {
  const s = await readSession("STAFF");
  if (!s?.staff || !s.staff.isActive) return null;
  // Sessions created before a password change are invalid.
  if (s.createdAt < s.staff.passwordChangedAt) return null;
  return { sessionId: s.id, csrfToken: s.csrfToken, staff: s.staff };
}

/** Server-side authorisation for staff routes. Every admin API and page calls this. */
export async function requireStaff(permission: Permission): Promise<StaffContext> {
  const ctx = await getStaff();
  if (!ctx) throw new AppError("UNAUTHENTICATED", "Please sign in.");
  if (!can(ctx.staff.role, permission)) throw new AppError("FORBIDDEN", "You do not have permission to do this.");
  return ctx;
}

/** For state-changing staff API calls: double-submit token bound to the server-side session. */
export function assertStaffCsrf(req: Request, ctx: StaffContext) {
  const header = req.headers.get("x-csrf-token");
  if (!header || header !== ctx.csrfToken) throw new AppError("FORBIDDEN", "Invalid security token. Reload the page.");
}

export interface CustomerContext {
  sessionId: string;
  customer: Customer;
}

export async function getCustomer(): Promise<CustomerContext | null> {
  const s = await readSession("CUSTOMER");
  if (!s?.customer || s.customer.isBlocked) return null;
  return { sessionId: s.id, customer: s.customer };
}

export async function requireCustomer(): Promise<CustomerContext> {
  const ctx = await getCustomer();
  if (!ctx) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  return ctx;
}

export async function purgeExpiredSessions() {
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
