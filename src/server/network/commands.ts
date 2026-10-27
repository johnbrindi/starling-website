import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";

/** Router command actions (router-pull mode). See the NetworkCommand model. */
export type RouterAction = "k" | "q" | "p" | "r" | "b" | "u";

export const MAC_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
export const USER_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** Speed tiers staff can give one login. The router has a matching user profile "jl-<tier>". */
export const SPEED_TIERS = {
  slow: { label: "Slow (2 Mbit/s down)", rate: "1M/2M" },
  normal: { label: "Normal (5 Mbit/s down)", rate: "2M/5M" },
  fast: { label: "Fast (10 Mbit/s down)", rate: "4M/10M" },
  max: { label: "Very fast (20 Mbit/s down)", rate: "8M/20M" },
} as const;
export type SpeedTier = keyof typeof SPEED_TIERS;
export const isSpeedTier = (v: unknown): v is SpeedTier => typeof v === "string" && v in SPEED_TIERS;

export function normalizeMac(mac: string): string | null {
  const m = mac.trim().toUpperCase().replace(/-/g, ":");
  return MAC_RE.test(m) ? m : null;
}

/** Queues a command for the router; it is sent on the next poll and repeated until confirmed. */
export async function queueRouterCommand(
  action: RouterAction,
  target: string,
  opts: { credentialId?: string | null; staffId?: string | null } = {},
  tx: Prisma.TransactionClient = db,
) {
  const ok = action === "b" || action === "u" ? MAC_RE.test(target) : USER_RE.test(target);
  if (!ok) throw new Error(`Unsafe router command target: ${action} ${target}`);
  return tx.networkCommand.create({ data: { action, target, credentialId: opts.credentialId ?? null, createdById: opts.staffId ?? null } });
}
