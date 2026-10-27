import "server-only";
import { db } from "../db";
import { audit } from "../audit";
import { AppError } from "../errors";
import { notify } from "../notifications/service";
import { isSpeedTier, normalizeMac, queueRouterCommand, USER_RE, type SpeedTier } from "./commands";

/** Staff: disconnect every device using this login now (the login itself stays valid). */
export async function disconnectLogin(username: string, staffId: string, ip?: string) {
  if (!USER_RE.test(username)) throw new AppError("VALIDATION_FAILED", "Invalid username.");
  const cred = await db.accessCredential.findUnique({ where: { username }, select: { id: true } });
  await queueRouterCommand("k", username, { credentialId: cred?.id, staffId });
  await audit({ actorType: "STAFF", actorId: staffId, action: "network.disconnect", targetType: "AccessCredential", targetId: cred?.id ?? username, ipAddress: ip, metadata: { username } });
}

/** Staff: pause a login. No access while paused, and the remaining time is frozen until resume. */
export async function pauseLogin(credentialId: string, staffId: string, ip?: string) {
  const cred = await db.accessCredential.findUnique({ where: { id: credentialId } });
  if (!cred) throw new AppError("NOT_FOUND", "Login not found.");
  if (cred.status !== "ACTIVE") throw new AppError("CONFLICT", `This login is ${cred.status.toLowerCase()}.`);
  if (cred.pausedAt) return cred;
  const now = new Date();
  await db.$transaction(async (tx) => {
    const moved = await tx.accessCredential.updateMany({ where: { id: cred.id, pausedAt: null, status: "ACTIVE" }, data: { pausedAt: now } });
    if (moved.count) await queueRouterCommand("p", cred.username, { credentialId: cred.id, staffId }, tx);
  });
  await audit({ actorType: "STAFF", actorId: staffId, action: "credential.paused", targetType: "AccessCredential", targetId: cred.id, ipAddress: ip });
  await notify(cred.customerId, { type: "REVOKED", title: "Wi-Fi paused", body: "Your Wi-Fi access was paused by Juthelink. Your remaining time is kept.", dedupeKey: `paused:${cred.id}:${now.getTime()}` });
}

/** Staff: resume a paused login; the paused time is added back to its end time. */
export async function resumeLogin(credentialId: string, staffId: string, ip?: string) {
  const cred = await db.accessCredential.findUnique({ where: { id: credentialId } });
  if (!cred) throw new AppError("NOT_FOUND", "Login not found.");
  if (!cred.pausedAt) return cred;
  const now = new Date();
  const pausedMs = Math.max(0, now.getTime() - cred.pausedAt.getTime());
  const validUntil = new Date(cred.validUntil.getTime() + pausedMs);
  await db.$transaction(async (tx) => {
    const moved = await tx.accessCredential.updateMany({
      where: { id: cred.id, pausedAt: cred.pausedAt },
      data: { pausedAt: null, validUntil, provisionState: "PENDING" },
    });
    if (!moved.count) return;
    await tx.subscription.updateMany({ where: { credentialId: cred.id, status: { in: ["ACTIVE", "SCHEDULED"] } }, data: { endsAt: validUntil } });
    await queueRouterCommand("r", cred.username, { credentialId: cred.id, staffId }, tx);
  });
  await audit({ actorType: "STAFF", actorId: staffId, action: "credential.resumed", targetType: "AccessCredential", targetId: cred.id, ipAddress: ip, metadata: { pausedMinutes: Math.round(pausedMs / 60000) } });
  await notify(cred.customerId, { type: "ACCESS_READY", title: "Wi-Fi resumed", body: "Your Wi-Fi access is back. The paused time was added to your pass.", dedupeKey: `resumed:${cred.id}:${now.getTime()}` });
}

/** Staff: block a device by MAC address (it can no longer use the Wi-Fi at all, even with a login). */
export async function blockDevice(mac: string, note: string | null, staffId: string, ip?: string) {
  const m = normalizeMac(mac);
  if (!m) throw new AppError("VALIDATION_FAILED", "Invalid device (MAC) address.");
  await db.deviceBlock.upsert({ where: { macAddress: m }, create: { macAddress: m, note, createdById: staffId }, update: { note } });
  await queueRouterCommand("b", m, { staffId });
  await audit({ actorType: "STAFF", actorId: staffId, action: "network.device_blocked", targetType: "Device", targetId: m, ipAddress: ip, metadata: { note } });
}

export async function unblockDevice(mac: string, staffId: string, ip?: string) {
  const m = normalizeMac(mac);
  if (!m) throw new AppError("VALIDATION_FAILED", "Invalid device (MAC) address.");
  await db.deviceBlock.deleteMany({ where: { macAddress: m } });
  await queueRouterCommand("u", m, { staffId });
  await audit({ actorType: "STAFF", actorId: staffId, action: "network.device_unblocked", targetType: "Device", targetId: m, ipAddress: ip });
}

/** Staff: change one login's speed tier and/or total data allowance. Applied on the router within seconds. */
export async function setLoginLimits(credentialId: string, input: { speed: SpeedTier | null; dataLimitMb: number | null }, staffId: string, ip?: string) {
  const cred = await db.accessCredential.findUnique({ where: { id: credentialId } });
  if (!cred) throw new AppError("NOT_FOUND", "Login not found.");
  if (input.speed !== null && !isSpeedTier(input.speed)) throw new AppError("VALIDATION_FAILED", "Unknown speed.");
  const dataLimitBytes = input.dataLimitMb ? BigInt(Math.round(input.dataLimitMb)) * 1024n * 1024n : null;
  await db.$transaction(async (tx) => {
    await tx.accessCredential.update({
      where: { id: cred.id },
      data: { rateLimit: input.speed, dataLimitBytes, ...(cred.status === "ACTIVE" && !cred.pausedAt ? { provisionState: "PENDING" } : {}) },
    });
    // Reconnect active devices so the new speed applies now (they log back in automatically).
    if (cred.status === "ACTIVE" && !cred.pausedAt) await queueRouterCommand("q", cred.username, { credentialId: cred.id, staffId }, tx);
  });
  await audit({ actorType: "STAFF", actorId: staffId, action: "credential.limits", targetType: "AccessCredential", targetId: cred.id, ipAddress: ip, metadata: { speed: input.speed, dataLimitMb: input.dataLimitMb } });
}
