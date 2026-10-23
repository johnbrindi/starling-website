"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** True when the browser reports a network connection (SSR assumes online). */
export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/** Registers the service worker and shows network/update notices. */
export function PwaRuntime() {
  const online = useOnline();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
          });
        });
      })
      .catch(() => undefined);
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }, []);

  return (
    <>
      {!online ? (
        <div role="status" className="fixed inset-x-0 bottom-0 z-50 bg-ink px-4 py-2.5 text-center text-sm text-white">
          You are offline. Payments and your live status need a connection.
        </div>
      ) : null}
      {waiting ? (
        <div role="status" className="fixed inset-x-3 bottom-3 z-50 flex items-center justify-between gap-3 rounded-md border border-line bg-white px-4 py-3 text-sm shadow-sm sm:left-auto sm:w-96">
          <span>A new version is available.</span>
          <button className="font-semibold text-brand-700" onClick={() => waiting.postMessage("SKIP_WAITING")}>
            Update
          </button>
        </div>
      ) : null}
    </>
  );
}
