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
    /\.(local|lan|wifi|starling|home\.arpa)$/.test(host) ||
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

const noop = () => () => {};

/** Subscribe function for useSyncExternalStore when a value only needs reading once on the client. */
export function subscribeNever() {
  return noop();
}

/** Stored router login URL (string, stable for useSyncExternalStore) or "" when none. */
export function storedLoginUrl(): string {
  return loadHotspotContext()?.loginUrl ?? "";
}

/**
 * Opens the router's own login page with the login after "#" (never sent over the network): the
 * Juthelink login.html fills the form and submits it (CHAP or PAP). Top-level navigation, so no
 * mixed-content block. Older pages without this script simply show the form.
 */
export function hotspotLoginHref(username: string, password: string, loginUrl: string, _returnTo?: string) {
  const u = new URL(loginUrl);
  u.hash = `u=${encodeURIComponent(username)}&p=${encodeURIComponent(password)}`;
  return u.toString();
}
