import "server-only";
import { db } from "../db";
import { env } from "../env";
import { CampayProvider } from "./providers/campay";
import { FapshiProvider } from "./providers/fapshi";
import { NotchPayProvider } from "./providers/notchpay";
import { SimulatorProvider } from "./providers/simulator";
import type { PaymentProviderAdapter, ProviderId } from "./types";

let override: PaymentProviderAdapter | undefined;
const cache = new Map<string, PaymentProviderAdapter>();

export function setPaymentProvider(p: PaymentProviderAdapter | undefined) {
  override = p;
}

/** Provider for a given id (used for status checks of existing payments). */
export function getProvider(id: ProviderId): PaymentProviderAdapter {
  if (override && override.id === id) return override;
  const e = env();
  if (id === "SIMULATOR") {
    // Defence in depth: env validation already forbids this in production.
    if (e.NODE_ENV === "production" || !e.ALLOW_SIMULATED_PAYMENTS) throw new Error("Simulated payments are disabled");
    if (!cache.has(id)) cache.set(id, new SimulatorProvider(db));
  } else if (id === "CAMPAY" && !cache.has(id)) {
    if (!e.CAMPAY_TOKEN && (!e.CAMPAY_USERNAME || !e.CAMPAY_PASSWORD)) throw new Error("Campay is not configured");
    cache.set(id, new CampayProvider({ baseUrl: e.CAMPAY_BASE_URL, token: e.CAMPAY_TOKEN, username: e.CAMPAY_USERNAME, password: e.CAMPAY_PASSWORD, webhookKey: e.CAMPAY_WEBHOOK_KEY }));
  } else if (id === "FAPSHI" && !cache.has(id)) {
    if (!e.FAPSHI_API_USER || !e.FAPSHI_API_KEY) throw new Error("Fapshi is not configured");
    cache.set(id, new FapshiProvider({ baseUrl: e.FAPSHI_BASE_URL, apiUser: e.FAPSHI_API_USER, apiKey: e.FAPSHI_API_KEY, webhookSecret: e.FAPSHI_WEBHOOK_SECRET }));
  } else if (id === "NOTCHPAY" && !cache.has(id)) {
    if (!e.NOTCHPAY_PUBLIC_KEY || !e.NOTCHPAY_WEBHOOK_HASH) throw new Error("Notch Pay is not configured");
    cache.set(id, new NotchPayProvider({ baseUrl: e.NOTCHPAY_BASE_URL, publicKey: e.NOTCHPAY_PUBLIC_KEY, webhookHash: e.NOTCHPAY_WEBHOOK_HASH }));
  }
  return cache.get(id)!;
}

/** Provider used for new checkouts. */
export function getActiveProvider(): PaymentProviderAdapter {
  if (override) return override;
  const p = env().PAYMENT_PROVIDER;
  return getProvider(p === "campay" ? "CAMPAY" : p === "fapshi" ? "FAPSHI" : p === "notchpay" ? "NOTCHPAY" : "SIMULATOR");
}
