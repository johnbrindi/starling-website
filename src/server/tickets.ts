import "server-only";
import { z } from "zod";
import type { AccessCredential } from "@/generated/prisma/client";
import { db } from "./db";
import { audit } from "./audit";
import { encrypt } from "./crypto";
import { env } from "./env";
import { AppError } from "./errors";
import { enqueue } from "./jobs/queue";
import { log } from "./logger";
import { effectivePrice } from "./payments/service";
import { credentialPassword, newCredentials, type CredentialStyle } from "./subscriptions/service";

const MB = 1024n * 1024n;

export const generateTicketsSchema = z.object({
  packageId: z.string().min(1),
  count: z.number().int().min(1).max(200),
  batch: z.string().trim().regex(/^[A-Za-z0-9_-]{2,30}$/, "Use 2-30 letters, numbers, - or _."),
  style: z.enum(["userpass", "code"]).default("userpass"),
  /** Unused tickets stop working after this many days. */
  activationDays: z.number().int().min(1).max(365).default(30),
});

export interface TicketDto {
  username: string;
  password: string;
  packageName: string;
  priceXaf: number;
  durationMinutes: number;
  activateBy: string;
}

/**
 * Printed tickets (the classic hotspot-business model): username + password created in advance,
 * sold offline, typed on the router login page. The paid time starts at the FIRST LOGIN seen on the
 * router; a ticket never used before its activation deadline expires.
 */
export async function generateTickets(input: z.infer<typeof generateTicketsSchema>, staffId: string, ip?: string) {
  const pkg = await db.package.findUnique({ where: { id: input.packageId }, include: { networkProfile: true } });
  if (!pkg || pkg.status === "ARCHIVED") throw new AppError("NOT_FOUND", "Package not found.");
  if (await db.accessCredential.findFirst({ where: { ticketBatch: input.batch } })) {
    throw new AppError("CONFLICT", "A batch with this name already exists.", [{ path: "batch", message: "Already used." }]);
  }
  // FreeRADIUS reads the password from the username, so RADIUS mode uses single codes.
  const style: CredentialStyle = env().NETWORK_ADAPTER === "radius" ? "code" : input.style;
  const now = new Date();
  const deadline = new Date(now.getTime() + input.activationDays * 86400_000);
  const price = effectivePrice(pkg).amount;
  const tickets: TicketDto[] = [];
  for (let i = 0; i < input.count; i++) {
    const cred = await db.$transaction(async (tx) => {
      const { username, password } = await newCredentials(tx, style, null);
      const c = await tx.accessCredential.create({
        data: {
          username,
          passwordEnc: encrypt(password),
          ticketBatch: input.batch,
          packageId: pkg.id,
          startsOnFirstLogin: true,
          durationMinutes: pkg.durationMinutes,
          priceXaf: price,
          validFrom: now,
          validUntil: deadline,
          dataLimitBytes: pkg.dataLimitMb ? BigInt(pkg.dataLimitMb) * MB : null,
          rateLimit: pkg.rateLimit,
          maxDevices: pkg.maxDevices,
          networkProfileName: pkg.networkProfile?.routerName ?? null,
        },
      });
      await enqueue("PROVISION_CREDENTIAL", { credentialId: c.id }, { dedupeKey: `provision:${c.id}`, maxAttempts: 20 }, tx);
      return { c, password };
    });
    tickets.push({ username: cred.c.username, password: cred.password, packageName: pkg.name, priceXaf: price, durationMinutes: pkg.durationMinutes, activateBy: deadline.toISOString() });
  }
  await audit({ actorType: "STAFF", actorId: staffId, action: "tickets.generated", targetType: "Package", targetId: pkg.id, ipAddress: ip, metadata: { batch: input.batch, count: input.count, style } });
  return { batch: input.batch, tickets };
}

/** Re-print the UNUSED tickets of a batch (passwords are stored encrypted, so they can be shown again). */
export async function unusedTickets(batch: string, staffId: string, ip?: string): Promise<TicketDto[]> {
  const rows = await db.accessCredential.findMany({
    where: { ticketBatch: batch, firstLoginAt: null, status: "ACTIVE", validUntil: { gt: new Date() } },
    include: { package: true },
    orderBy: { createdAt: "asc" },
  });
  await audit({ actorType: "STAFF", actorId: staffId, action: "tickets.reprinted", ipAddress: ip, metadata: { batch, count: rows.length } });
  return rows.map((c) => ({
    username: c.username,
    password: credentialPassword(c),
    packageName: c.package?.name ?? "Pass",
    priceXaf: c.priceXaf ?? 0,
    durationMinutes: c.durationMinutes ?? 0,
    activateBy: c.validUntil.toISOString(),
  }));
}

/** Revokes every unused ticket of a batch (lost or stolen tickets). Used tickets keep running. */
export async function revokeUnusedTickets(batch: string, staffId: string, ip?: string) {
  const rows = await db.accessCredential.findMany({ where: { ticketBatch: batch, firstLoginAt: null, status: "ACTIVE" }, select: { id: true } });
  for (const r of rows) {
    await db.accessCredential.update({ where: { id: r.id }, data: { status: "REVOKED", provisionState: "DEPROVISION_PENDING" } });
    await enqueue("DEPROVISION_CREDENTIAL", { credentialId: r.id }, { dedupeKey: `deprovision:${r.id}`, maxAttempts: 30 });
  }
  await audit({ actorType: "STAFF", actorId: staffId, action: "tickets.revoked_unused", ipAddress: ip, metadata: { batch, count: rows.length } });
  return rows.length;
}

/**
 * Called by session sync: the first time a ticket appears online, start its clock
 * (expiry = first login + paid duration) and re-push it so the router enforces the new end time.
 */
export async function activateTicketsOnFirstLogin(creds: AccessCredential[], firstSeen: Map<string, Date>) {
  let activated = 0;
  for (const c of creds) {
    if (!c.startsOnFirstLogin || c.firstLoginAt || c.status !== "ACTIVE" || !c.durationMinutes) continue;
    const at = firstSeen.get(c.username);
    if (!at) continue;
    const until = new Date(at.getTime() + c.durationMinutes * 60_000);
    const moved = await db.accessCredential.updateMany({
      where: { id: c.id, firstLoginAt: null, status: "ACTIVE" },
      data: { firstLoginAt: at, validFrom: at, validUntil: until, provisionState: "PENDING" },
    });
    if (moved.count === 0) continue;
    await enqueue("PROVISION_CREDENTIAL", { credentialId: c.id }, { dedupeKey: `provision:${c.id}`, maxAttempts: 20 });
    await audit({ actorType: "SYSTEM", action: "ticket.activated", targetType: "AccessCredential", targetId: c.id, metadata: { batch: c.ticketBatch, until: until.toISOString() } });
    activated++;
  }
  if (activated) log.info("Tickets activated on first login", { count: activated });
  return activated;
}
