import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { isEntitled } from "../subscriptions/service";

const SAFE = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_BYTES = 3500; // RouterOS v6 "/tool fetch output=user" returns at most ~4 KB

/** Router profile for a credential: the mapped profile, else derived from the package length. */
const BY_DURATION: Record<number, string> = { 60: "1hour", 720: "12hours", 1440: "24hours", 10080: "1week", 20160: "2weeks", 43200: "1month" };

/**
 * Applies the router's confirmations from its previous poll ("ok" usernames), then returns the next
 * batch of commands as plain text lines:  a,<user>,<password>,<profile>,<phone>  |  d,<user>
 */
export async function routerPull(okUsernames: string[], now = new Date()): Promise<{ body: string; adds: number; deletes: number; confirmed: number }> {
  let confirmed = 0;
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
    where: { provisionState: "DEPROVISION_PENDING", status: { not: "ACTIVE" } },
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
    const profile = c.networkProfileName ?? BY_DURATION[minutes] ?? "default";
    const phone = (c.customer?.phone ?? "").replace(/\D/g, "").replace(/^237/, "");
    if (!SAFE.test(c.username) || !SAFE.test(password) || !SAFE.test(profile)) continue; // never send anything a router script could misread
    if (push(`a,${c.username},${password},${profile},${phone}`)) added++;
  }
  return { body: lines.join("\n"), adds: added, deletes, confirmed };
}

export async function recordRouterCheckIn(detail: Record<string, unknown>) {
  const data = { ok: true, mode: "routerpull", detail: detail as Prisma.InputJsonValue, error: null, checkedAt: new Date() };
  await db.integrationStatus.upsert({ where: { key: "router-pull" }, create: { key: "router-pull", ...data }, update: data });
}
