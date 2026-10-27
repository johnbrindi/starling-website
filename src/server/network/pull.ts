import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { isEntitled } from "../subscriptions/service";
import { isSpeedTier, MAC_RE } from "./commands";

const SAFE = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_BYTES = 3500; // RouterOS v6 "/tool fetch output=user" returns at most ~4 KB

/** Router profile for a credential: the mapped profile, else derived from the package length. */
const BY_DURATION: Record<number, string> = { 60: "1hour", 720: "12hours", 1440: "24hours", 10080: "1week", 20160: "2weeks", 43200: "1month" };

const ID_RE = /^[a-z0-9]{10,40}$/;

/**
 * Applies the router's confirmations from its previous poll ("ok" usernames, "c" command ids), then
 * returns the next batch as plain text lines (deletes first, then logins, then one-off commands):
 *   d,<user>
 *   a,<user>,<password>,<profile>,<phone>,<limit-bytes-total or 0>
 *   c,<id>,<k|q|p|r|b|u>,<user or MAC>
 */
export async function routerPull(
  okUsernames: string[],
  now = new Date(),
  doneCommandIds: string[] = [],
): Promise<{ body: string; adds: number; deletes: number; confirmed: number; commands: number }> {
  let confirmed = 0;
  const doneIds = doneCommandIds.filter((id) => ID_RE.test(id)).slice(0, 100);
  if (doneIds.length) {
    const r = await db.networkCommand.updateMany({ where: { id: { in: doneIds }, doneAt: null }, data: { doneAt: now } });
    confirmed += r.count;
  }
  const ok = okUsernames.filter((u) => SAFE.test(u)).slice(0, 100);
  if (ok.length) {
    const creds = await db.accessCredential.findMany({ where: { username: { in: ok } } });
    for (const c of creds) {
      if (c.provisionState === "DEPROVISION_PENDING" && !isEntitled(c, now)) {
        await db.accessCredential.update({ where: { id: c.id }, data: { provisionState: "REMOVED", lastSyncError: null } });
        confirmed++;
      } else if ((c.provisionState === "PENDING" || c.provisionState === "FAILED") && isEntitled(c, now)) {
        await db.accessCredential.update({
          where: { id: c.id },
          data: { provisionState: "PROVISIONED", provisionedAt: now, provisionedUntil: c.validUntil, lastSyncError: null },
        });
        confirmed++;
      }
    }
  }

  const lines: string[] = [];
  let size = 0;
  const push = (line: string) => {
    if (size + line.length + 1 > MAX_BYTES) return false;
    lines.push(line);
    size += line.length + 1;
    return true;
  };

  // Deletes first (expired / revoked), then new logins.
  const dels = await db.accessCredential.findMany({
    where: { provisionState: "DEPROVISION_PENDING", status: { not: "ACTIVE" }, pausedAt: null },
    select: { username: true },
    orderBy: { updatedAt: "asc" },
    take: 40,
  });
  let deletes = 0;
  for (const d of dels) if (SAFE.test(d.username) && push(`d,${d.username}`)) deletes++;

  const where: Prisma.AccessCredentialWhereInput = {
    provisionState: { in: ["PENDING", "FAILED"] },
    status: "ACTIVE",
    validFrom: { lte: now },
    validUntil: { gt: now },
    pausedAt: null,
  };
  const adds = await db.accessCredential.findMany({
    where,
    include: { customer: { select: { phone: true } }, subscriptions: { select: { durationMinutes: true }, take: 1, orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "asc" },
    take: 40,
  });
  const { credentialPassword } = await import("../subscriptions/service");
  let added = 0;
  for (const c of adds) {
    const password = credentialPassword(c);
    const minutes = c.durationMinutes ?? c.subscriptions[0]?.durationMinutes ?? 0;
    // A staff speed override uses the router's "jl-<tier>" profile instead of the plan's.
    const profile = isSpeedTier(c.rateLimit) ? `jl-${c.rateLimit}` : (c.networkProfileName ?? BY_DURATION[minutes] ?? "default");
    const phone = (c.customer?.phone ?? "").replace(/\D/g, "").replace(/^237/, "");
    const limit = c.dataLimitBytes && c.dataLimitBytes > 0n ? c.dataLimitBytes.toString() : "0";
    if (!SAFE.test(c.username) || !SAFE.test(password) || !SAFE.test(profile) || !/^\d{1,15}$/.test(limit)) continue; // never send anything a router script could misread
    if (push(`a,${c.username},${password},${profile},${phone},${limit}`)) added++;
  }

  // One-off commands (disconnect, pause, block...), oldest first, repeated until confirmed.
  const cmds = await db.networkCommand.findMany({
    where: { doneAt: null, createdAt: { gt: new Date(now.getTime() - 24 * 3600_000) } },
    orderBy: { createdAt: "asc" },
    take: 40,
  });
  let commands = 0;
  const sent: string[] = [];
  for (const c of cmds) {
    const targetOk = c.action === "b" || c.action === "u" ? MAC_RE.test(c.target) : SAFE.test(c.target);
    if (!ID_RE.test(c.id) || !/^[kqprbu]$/.test(c.action) || !targetOk) continue;
    if (push(`c,${c.id},${c.action},${c.target}`)) {
      commands++;
      sent.push(c.id);
    }
  }
  if (sent.length) await db.networkCommand.updateMany({ where: { id: { in: sent }, sentAt: null }, data: { sentAt: now } });
  return { body: lines.join("\n"), adds: added, deletes, confirmed, commands };
}

export async function recordRouterCheckIn(detail: Record<string, unknown>) {
  const data = { ok: true, mode: "routerpull", detail: detail as Prisma.InputJsonValue, error: null, checkedAt: new Date() };
  await db.integrationStatus.upsert({ where: { key: "router-pull" }, create: { key: "router-pull", ...data }, update: data });
}
