// Captive-portal context handed over by the MikroTik login page (client-side only).

const KEY = "starling.hotspot";

export interface HotspotContext {
  loginUrl: string;
  mac?: string;
  ip?: string;
  savedAt: number;
}

function isPrivateHost(host: string) {
  return (
    /^10\.\d+\.\d+\.\d+$/.test(host) ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host) ||
    /\.(local|lan|wifi|home\.arpa)$/.test(host) ||
    !host.includes(".")
  );
}

/** Only accept router login URLs on the local network, never arbitrary sites (open-redirect guard). */
export function sanitizeLoginUrl(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  try {
    const u = new URL(raw);
    if ((u.protocol === "http:" || u.protocol === "https:") && (isPrivateHost(u.hostname) || u.host === new URL(fallback).host)) {
      return `${u.origin}${u.pathname}`;
    }
  } catch {
    // ignore
  }
  return fallback;
}

export function saveHotspotContext(ctx: Omit<HotspotContext, "savedAt">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...ctx, savedAt: Date.now() }));
  } catch {
    // storage unavailable (private mode): the default login URL is used instead
  }
}

export function loadHotspotContext(): HotspotContext | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const ctx = JSON.parse(raw) as HotspotContext;
    // Router context is only meaningful for a short while (same network session).
    return Date.now() - ctx.savedAt < 12 * 3600_000 ? ctx : null;
  } catch {
    return null;
  }
}

/**
 * MikroTik HotSpot accepts username/password on its /login URL. Navigating there (top-level, so
 * no mixed-content block) logs this device in; "dst" brings the customer back to their dashboard.
 * Requires "http-pap" in the hotspot server profile's login-by (see docs/mikrotik-integration.md).
 */
const noop = () => () => {};

/** Subscribe function for useSyncExternalStore when a value only needs reading once on the client. */
export function subscribeNever() {
  return noop();
}

/** Stored router login URL (string, stable for useSyncExternalStore) or "" when none. */
export function storedLoginUrl(): string {
  return loadHotspotContext()?.loginUrl ?? "";
}

export function hotspotLoginHref(username: string, password: string, loginUrl: string, returnTo: string) {
  const u = new URL(loginUrl);
  u.searchParams.set("username", username);
  u.searchParams.set("password", password);
  u.searchParams.set("dst", returnTo);
  return u.toString();
}
