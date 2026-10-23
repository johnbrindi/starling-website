import "server-only";
import { z } from "zod";
import { db } from "./db";

/** Operational settings editable by administrators (stored in the Setting table). */
export const settingsSchema = z.object({
  businessName: z.string().min(2).max(80).default("Starling Wi-Fi"),
  supportPhone: z.string().max(30).default("+237 600 000 000"),
  supportWhatsapp: z.string().max(30).default(""),
  supportHours: z.string().max(80).default("Every day, 7:00 to 22:00"),
  location: z.string().max(120).default(""),
  /** EXTEND: a renewal is stacked after the current expiry on the same code. IMMEDIATE: new code, starts now. */
  renewalMode: z.enum(["EXTEND", "IMMEDIATE"]).default("EXTEND"),
  /** Minutes before expiry at which customers are warned. */
  warningMinutes: z.array(z.number().int().min(1).max(1440)).max(5).default([15, 5, 1]),
  /** A pending payment not approved within this window is expired. */
  paymentTimeoutMinutes: z.number().int().min(2).max(60).default(10),
  maxPendingPaymentsPerPhone: z.number().int().min(1).max(10).default(3),
  /** Also install a RouterOS scheduler entry that removes the user at expiry (router-side backstop). */
  routerExpiryScheduler: z.boolean().default(true),
  /** How often the worker polls the router for active sessions. */
  sessionSyncSeconds: z.number().int().min(15).max(3600).default(60),
});

export type Settings = z.infer<typeof settingsSchema>;
export const SETTINGS_KEY = "app";

export async function getSettings(): Promise<Settings> {
  const row = await db.setting.findUnique({ where: { key: SETTINGS_KEY } });
  const parsed = settingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : settingsSchema.parse({});
}

export async function updateSettings(patch: Partial<Settings>, staffId: string): Promise<Settings> {
  const current = await getSettings();
  const next = settingsSchema.parse({ ...current, ...patch });
  next.warningMinutes = [...new Set(next.warningMinutes)].sort((a, b) => b - a);
  await db.setting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: next, updatedBy: staffId },
    update: { value: next, updatedBy: staffId },
  });
  return next;
}
