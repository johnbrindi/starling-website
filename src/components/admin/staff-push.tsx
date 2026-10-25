"use client";

import { useState, useSyncExternalStore } from "react";
import { subscribeNever } from "@/lib/hotspot";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { useAdminApi } from "./admin-context";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type Support = "ok" | "ios-install" | "unsupported";

function support(): Support {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return "unsupported";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (!("PushManager" in window) || typeof Notification === "undefined") return ios && !standalone ? "ios-install" : "unsupported";
  return "ok";
}

/**
 * Turns on "new MoMo payment to confirm" notifications on this phone (Web Push, works when the
 * admin app is closed). Each device must be turned on once.
 */
export function StaffPushToggle() {
  const call = useAdminApi();
  const sup = useSyncExternalStore(subscribeNever, support, () => "unsupported" as Support);
  const permission = useSyncExternalStore(subscribeNever, () => (typeof Notification === "undefined" ? "default" : Notification.permission), () => "default");
  const [state, setState] = useState<"idle" | "busy" | "on" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function enable() {
    setState("busy");
    setMsg(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications are blocked for this site. Allow them in the browser settings, then try again.");
      const { publicKey } = await api<{ publicKey: string | null }>("/api/push/key");
      if (!publicKey) throw new Error("Notifications are not configured on the server.");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      await call("/api/admin/push/subscribe", { body: sub.toJSON() });
      const r = await call<{ ok: boolean; message: string }>("/api/admin/push/test", { body: {} });
      setMsg(r.ok ? "On. You just received a test notification." : r.message);
      setState(r.ok ? "on" : "error");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not turn notifications on.");
      setState("error");
    }
  }

  if (sup === "unsupported") return <p className="text-xs text-muted">This browser cannot receive notifications. Use Chrome on Android, or install the admin app on iPhone.</p>;
  if (sup === "ios-install") {
    return <p className="text-xs text-muted">iPhone: tap Share → <b>Add to Home Screen</b>, open “JL Admin” from the home screen, then turn notifications on there.</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      <Button variant={state === "on" ? "secondary" : "primary"} onClick={enable} loading={state === "busy"}>
        {state === "on" || (state === "idle" && permission === "granted") ? "Notifications on · send a test" : "Turn on payment notifications on this phone"}
      </Button>
      {msg ? <p className={`text-xs ${state === "error" ? "text-bad" : "text-muted"}`}>{msg}</p> : null}
    </div>
  );
}
