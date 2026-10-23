import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { FakeNetworkAdapter, MemoryFakeStore } from "@/server/network/fake";
import { setNetworkAdapter } from "@/server/network";
import { setPaymentProvider } from "@/server/payments/registry";
import { SETTINGS_KEY } from "@/server/settings";
import { resetEnvCache } from "@/server/env";

/** Empties every table (test database only). */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

export function useFakeNetwork() {
  const store = new MemoryFakeStore();
  const adapter = new FakeNetworkAdapter(store);
  setNetworkAdapter(adapter);
  return { adapter, store };
}

export function resetOverrides() {
  setNetworkAdapter(undefined);
  setPaymentProvider(undefined);
  resetEnvCache();
}

export async function setSettings(value: Prisma.InputJsonObject) {
  await db.setting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value }, update: { value } });
}

export async function makePackage(overrides: Partial<{ priceXaf: number; durationMinutes: number; dataLimitMb: number | null; maxDevices: number; status: "ACTIVE" | "INACTIVE" | "ARCHIVED"; slug: string }> = {}) {
  return db.package.create({
    data: {
      slug: overrides.slug ?? `p-${Math.random().toString(36).slice(2, 8)}`,
      name: "1 Hour",
      description: "Test package",
      priceXaf: overrides.priceXaf ?? 100,
      durationMinutes: overrides.durationMinutes ?? 60,
      dataLimitMb: overrides.dataLimitMb ?? null,
      maxDevices: overrides.maxDevices ?? 1,
      status: overrides.status ?? "ACTIVE",
    },
  });
}

/** Phone numbers follow the simulator convention: last digit 0 = success, 1 = failure, 5 = stays pending. */
export const PHONES = { success: "670000000", fail: "670000001", pending: "670000005", cancel: "670000004" };

/** A registered customer for a phone (the simulator decides outcomes from the payer phone's last digit). */
export async function customerFor(phone: string) {
  const e164 = `+237${phone.replace(/\D/g, "").slice(-9)}`;
  return db.customer.upsert({ where: { phone: e164 }, create: { phone: e164, name: "Test Customer", passwordHash: "x" }, update: {} });
}
