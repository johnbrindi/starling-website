import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { applyActiveSessions } from "./sync";
import { MAC_RE, USER_RE, queueRouterCommand } from "./commands";
import type { ActiveSession } from "./types";

/** RouterOS time ("1w2d03:04:05", "03:04:05", "1h2m3s") to seconds; -1 when unreadable. */
export function routerTimeToSeconds(v: string): number {
  const s = v.trim();
  if (!s) return -1;
  let total = 0;
  let rest = s;
  const clock = rest.match(/(\d+):(\d{2}):(\d{2})$/);
  if (clock) {
    total += Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
    rest = rest.slice(0, clock.index);
  }
  const units: Record<string, number> = { w: 604800, d: 86400, h: 3600, m: 60, s: 1 };
  const re = /(\d+)([wdhms])/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(rest))) {
    total += Number(m[1]) * units[m[2]!]!;
    consumed += m[0].length;
  }
  if (consumed !== rest.length) return -1;
  return total;
}

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const ID_RE = /^\*[0-9A-Fa-f]{1,8}$/;

/**
 * Parses the router's report: one line per logged-in device
 *   <id>,<user>,<mac>,<ip>,<uptime>,<bytes-in>,<bytes-out>
 * Lines that do not match exactly are ignored (never trust free text from the network).
 */
export function parseRouterReport(body: string): ActiveSession[] {
  const out: ActiveSession[] = [];
  for (const raw of body.split(/\r?\n/).slice(0, 500)) {
    const f = raw.trim().split(",");
    if (f.length !== 7) continue;
    const [id, user, mac, ip, uptime, bin, bout] = f as [string, string, string, string, string, string, string];
    const secs = routerTimeToSeconds(uptime);
    if (!ID_RE.test(id) || !USER_RE.test(user) || !MAC_RE.test(mac.toUpperCase()) || !IP_RE.test(ip) || secs < 0 || !/^\d{1,15}$/.test(bin) || !/^\d{1,15}$/.test(bout)) continue;
    out.push({ externalId: id, username: user, macAddress: mac.toUpperCase(), ipAddress: ip, uptimeSeconds: secs, bytesIn: BigInt(bin), bytesOut: BigInt(bout) });
  }
  return out;
}

/** Applies a router report (router-pull mode). Unentitled or paused logins are disconnected on the next poll. */
export async function applyRouterReport(body: string, now = new Date()) {
  const sessions = parseRouterReport(body);
  const { kicked } = await applyActiveSessions(sessions, now, {
    onUnentitled: async (cred) => {
      if (cred.pausedAt) {
        // Paused: make sure the router has the pause (re-sent until confirmed).
        const pending = await db.networkCommand.count({ where: { action: "p", target: cred.username, doneAt: null } });
        if (!pending) await queueRouterCommand("p", cred.username, { credentialId: cred.id });
      } else if (cred.provisionState !== "DEPROVISION_PENDING") {
        await db.accessCredential.update({ where: { id: cred.id }, data: { provisionState: "DEPROVISION_PENDING" } });
      }
      return 1;
    },
  });
  const data = { ok: true, mode: "routerpull", detail: { devices: sessions.length, kicked } as Prisma.InputJsonValue, error: null, checkedAt: now };
  await db.integrationStatus.upsert({ where: { key: "router-report" }, create: { key: "router-report", ...data }, update: data });
  return { devices: sessions.length, kicked };
}
