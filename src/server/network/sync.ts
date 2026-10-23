import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { env } from "../env";
import { enqueue } from "../jobs/queue";
import { errorMessage, log } from "../logger";
import { isEntitled } from "../subscriptions/service";
import { getNetworkAdapter } from "./index";

async function recordStatus(ok: boolean, detail: Record<string, unknown>, error?: string) {
  const adapter = getNetworkAdapter();
  const data = { ok, mode: adapter.kind, detail: detail as Prisma.InputJsonValue, error: error ?? null, checkedAt: new Date() };
  await db.integrationStatus.upsert({ where: { key: "network" }, create: { key: "network", ...data }, update: data });
}

export async function checkNetworkHealth() {
  const adapter = getNetworkAdapter();
  const h = await adapter.health();
  await recordStatus(h.ok, { ...h }, h.error);
  return h;
}

/**
 * Pulls active sessions from the network, records them, and ENFORCES entitlement:
 * any session belonging to a credential that is not entitled right now is disconnected and the
 * user removed. This is what guarantees an expired customer cannot keep browsing.
 */
export async function syncSessions(now = new Date()) {
  const adapter = getNetworkAdapter();
  let sessions;
  try {
    sessions = await adapter.listActiveSessions();
  } catch (err) {
    await recordStatus(false, {}, errorMessage(err));
    throw err;
  }
  const usernames = [...new Set(sessions.map((s) => s.username))];
  const creds = await db.accessCredential.findMany({ where: { username: { in: usernames } } });
  const byName = new Map(creds.map((c) => [c.username, c]));
  let kicked = 0;

  for (const s of sessions) {
    const cred = byName.get(s.username);
    const existing = await db.networkSession.findFirst({ where: { externalId: s.externalId, username: s.username, endedAt: null } });
    if (existing) {
      await db.networkSession.update({
        where: { id: existing.id },
        data: { lastSeenAt: now, bytesIn: s.bytesIn, bytesOut: s.bytesOut, uptimeSeconds: s.uptimeSeconds, ipAddress: s.ipAddress, macAddress: s.macAddress },
      });
    } else {
      await db.networkSession.create({
        data: {
          credentialId: cred?.id ?? null,
          username: s.username,
          externalId: s.externalId,
          macAddress: s.macAddress,
          ipAddress: s.ipAddress,
          startedAt: new Date(now.getTime() - s.uptimeSeconds * 1000),
          lastSeenAt: now,
          bytesIn: s.bytesIn,
          bytesOut: s.bytesOut,
          uptimeSeconds: s.uptimeSeconds,
        },
      });
    }
    if (cred && !isEntitled(cred, now)) {
      kicked += await adapter.disconnectUser(cred.username).catch(() => 0);
      await enqueue("DEPROVISION_CREDENTIAL", { credentialId: cred.id }, { dedupeKey: `deprovision:${cred.id}`, maxAttempts: 30 });
      log.warn("Disconnected session without entitlement", { credentialId: cred.id, status: cred.status });
    }
  }

  // Sessions we knew about that the router no longer reports have ended.
  const liveIds = new Set(sessions.map((s) => `${s.username}|${s.externalId}`));
  const open = await db.networkSession.findMany({ where: { endedAt: null } });
  for (const o of open) {
    if (!liveIds.has(`${o.username}|${o.externalId}`)) {
      await db.networkSession.update({ where: { id: o.id }, data: { endedAt: now, endReason: o.endReason ?? "logged-out" } });
    }
  }

  // Usage accounting per credential (sum over its sessions).
  for (const c of creds) {
    const agg = await db.networkSession.aggregate({ where: { credentialId: c.id }, _sum: { bytesIn: true, bytesOut: true } });
    await db.accessCredential.update({
      where: { id: c.id },
      data: { bytesIn: agg._sum.bytesIn ?? 0n, bytesOut: agg._sum.bytesOut ?? 0n, lastUsageAt: now },
    });
  }
  await recordStatus(true, { activeSessions: sessions.length, kicked, adapter: adapter.kind, simulated: adapter.simulated });
  return { active: sessions.length, kicked };
}

/**
 * Compares the router's managed users with the database:
 * - entitled credentials missing on the router are re-provisioned
 * - router users that are not entitled are removed
 */
export async function reconcileNetwork(now = new Date()) {
  const adapter = getNetworkAdapter();
  const routerUsers = await adapter.listManagedUsers();
  const onRouter = new Set(routerUsers.map((u) => u.username));
  const entitled = await db.accessCredential.findMany({
    where: { status: "ACTIVE", validFrom: { lte: now }, validUntil: { gt: now } },
    select: { id: true, username: true, provisionState: true },
  });
  const entitledNames = new Set(entitled.map((c) => c.username));
  let reprovisioned = 0;
  let removed = 0;

  for (const c of entitled) {
    if (!onRouter.has(c.username) || c.provisionState !== "PROVISIONED") {
      await enqueue("PROVISION_CREDENTIAL", { credentialId: c.id }, { dedupeKey: `provision:${c.id}`, maxAttempts: 20 });
      reprovisioned++;
    }
  }
  for (const u of routerUsers) {
    if (entitledNames.has(u.username)) continue;
    const cred = await db.accessCredential.findUnique({ where: { username: u.username }, select: { id: true } });
    if (cred) {
      await enqueue("DEPROVISION_CREDENTIAL", { credentialId: cred.id }, { dedupeKey: `deprovision:${cred.id}`, maxAttempts: 30 });
    } else {
      // Managed comment but unknown to us (e.g. from a wiped dev database): remove it.
      await adapter.removeUser(u.username);
    }
    removed++;
  }
  // Credentials stuck in DEPROVISION_PENDING / FAILED get a fresh job.
  const stuck = await db.accessCredential.findMany({ where: { provisionState: { in: ["DEPROVISION_PENDING"] } }, select: { id: true } });
  for (const c of stuck) await enqueue("DEPROVISION_CREDENTIAL", { credentialId: c.id }, { dedupeKey: `deprovision:${c.id}`, maxAttempts: 30 });

  return { reprovisioned, removed, routerUsers: routerUsers.length };
}

/** Pushes every network profile used by packages to the router. */
export async function syncProfiles() {
  const adapter = getNetworkAdapter();
  const profiles = await db.networkProfile.findMany();
  const results: { name: string; ok: boolean; error?: string }[] = [];
  for (const p of profiles) {
    try {
      await adapter.syncProfile({ name: p.routerName, rateLimit: p.rateLimit, sharedUsers: p.sharedUsers, idleTimeout: p.idleTimeout });
      await db.networkProfile.update({ where: { id: p.id }, data: { lastSyncedAt: new Date(), lastSyncError: null } });
      results.push({ name: p.routerName, ok: true });
    } catch (err) {
      await db.networkProfile.update({ where: { id: p.id }, data: { lastSyncError: errorMessage(err).slice(0, 300) } });
      results.push({ name: p.routerName, ok: false, error: errorMessage(err) });
    }
  }
  return results;
}

export async function validateNetwork() {
  const profiles = await db.networkProfile.findMany({ select: { routerName: true } });
  return getNetworkAdapter().validateConfiguration({
    profiles: profiles.map((p) => p.routerName),
    portalHost: new URL(env().APP_URL).hostname,
  });
}
