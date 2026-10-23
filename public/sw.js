/* Starling Wi-Fi service worker.
 * - Static, content-hashed assets: cache-first.
 * - Page navigations: network-only, falling back to the cached /offline page.
 * - API calls, payments and account data: never cached (always network).
 * Offline mode can never fabricate a payment or grant network access.
 * Bump VERSION when this file changes; the page offers "Update" when a new worker is waiting.
 */
const VERSION = "v1";
const STATIC_CACHE = `starling-static-${VERSION}`;
const PRECACHE = ["/offline", "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("starling-") && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // always network, never cached

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    // Private pages are not stored; offline we show a generic page with no customer data.
    event.respondWith(fetch(req).catch(() => caches.match("/offline").then((r) => r || Response.error())));
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Starling Wi-Fi", body: "", url: "/account" };
  try {
    data = { ...data, ...event.data.json() };
  } catch (_) {
    /* ignore malformed payloads */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.type || "starling",
      renotify: true,
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/account";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).pathname.startsWith("/account") && "focus" in w) return w.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
