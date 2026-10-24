"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { AccessStatusDto } from "@/lib/types";
import { api, ApiError } from "@/lib/api-client";
import { formatAccessCode, formatBytes, formatDateTime, formatRemaining } from "@/lib/format";
import { hotspotLoginHref, sanitizeLoginUrl, storedLoginUrl, subscribeNever } from "@/lib/hotspot";
import { Alert, Badge, Card } from "@/components/ui/primitives";
import { Button, LinkButton, Spinner } from "@/components/ui/button";
import { ClockIcon, DevicesIcon, WifiIcon } from "@/components/ui/icons";

interface Props {
  initial: AccessStatusDto;
  networkSimulated: boolean;
}

/**
 * Shows the customer's access. The countdown is for display only: it is derived from the server's
 * clock and validUntil, refreshed regularly, and the router/server enforce the real deadline.
 */
export function AccessPanel({ initial, networkSimulated }: Props) {
  const [status, setStatus] = useState(initial);
  const [offset, setOffset] = useState(() => new Date(initial.serverTime).getTime() - Date.now());
  const [now, setNow] = useState(() => new Date(initial.serverTime).getTime());
  const [connectMsg, setConnectMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const warned = useRef<Set<number>>(new Set());
  const warnInit = useRef(false);
  // Browser-only values (local clock, timezone, router context) are read after hydration.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const storedUrl = useSyncExternalStore(subscribeNever, storedLoginUrl, () => "");
  const origin = useSyncExternalStore(subscribeNever, () => window.location.origin, () => "");
  const login = { url: sanitizeLoginUrl(storedUrl || null, initial.hotspotLoginUrl), returnTo: `${origin}/account` };

  const refresh = useCallback(async () => {
    try {
      const s = await api<AccessStatusDto>("/api/me/access");
      setOffset(new Date(s.serverTime).getTime() - Date.now());
      setStatus(s);
    } catch {
      // keep last known state; the offline banner explains connectivity
    }
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(refresh, status.state === "PROVISIONING" ? 4000 : 20000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
    };
  }, [refresh, status.state]);

  const cred = status.credential;
  const remainingMs = cred ? new Date(cred.validUntil).getTime() - (now + offset) : 0;
  const active = status.state === "READY" || status.state === "ONLINE" || status.state === "PROVISIONING";

  // When the display reaches zero, ask the server (it decides; the browser never extends access).
  const validUntilMs = cred ? new Date(cred.validUntil).getTime() : 0;
  useEffect(() => {
    if (!active || !validUntilMs) return;
    const t = setTimeout(refresh, Math.max(0, validUntilMs - (Date.now() + offset)) + 1500);
    return () => clearTimeout(t);
  }, [active, validUntilMs, offset, refresh]);

  // Local warnings while the page is open (push covers the closed-app case when enabled).
  useEffect(() => {
    if (!active || !cred) return;
    const mins = remainingMs / 60000;
    for (const t of status.warningMinutes) {
      if (mins <= t && mins > 0 && !warned.current.has(t)) {
        warned.current.add(t);
        // Thresholds already passed when the page opened are marked silently (the server sent those).
        if (warnInit.current) showLocalNotification(`${Math.max(1, Math.ceil(mins))} minutes of Wi-Fi left`, "Renew now to stay connected.");
      }
    }
    warnInit.current = true;
  }, [active, cred, remainingMs, status.warningMinutes]);

  const code = cred?.username ?? "";
  const password = cred?.password ?? "";
  const userpass = cred?.style === "userpass";

  // Bought from the Wi-Fi login page: as soon as the router has the login, connect this phone automatically (once).
  const autoConnect = !!storedUrl && status.state === "READY" && !!code;
  useEffect(() => {
    if (!autoConnect) return;
    const key = `starling.autoconnect.${code}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    const t = setTimeout(() => window.location.assign(hotspotLoginHref(code, password, login.url, login.returnTo)), 1200);
    return () => clearTimeout(t);
  }, [autoConnect, code, password, login.url, login.returnTo]);

  async function simulateConnect() {
    setConnectMsg(null);
    try {
      await api("/api/dev/hotspot-login", { body: { code } });
      await refresh();
      setConnectMsg("Simulated: this device is now logged in on the test router.");
    } catch (err) {
      setConnectMsg(err instanceof ApiError ? `Router refused login: ${err.message}` : "Simulation failed.");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(userpass ? `${code} / ${password}` : code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked; the code is visible anyway
    }
  }

  const soon = mounted && active && remainingMs > 0 && remainingMs <= Math.max(...status.warningMinutes, 0) * 60000;

  return (
    <div className="space-y-4">
      {soon ? (
        <Alert tone="warn" title={`Only ${formatRemaining(remainingMs)} left`}>
          Renew now so you are not disconnected. <Link href="/plans" className="font-semibold underline">Buy more time</Link>
        </Alert>
      ) : null}

      <Card>
        <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <WifiIcon className="h-4 w-4 text-brand-600" /> Your Wi-Fi access
          </div>
          <StateBadge state={status.state} />
        </div>

        {status.state === "NONE" ? (
          <div className="px-4 py-8 text-center sm:px-5">
            <p className="text-sm text-muted">You have no active pass yet.</p>
            <LinkButton href="/plans" className="mt-4">
              See plans
            </LinkButton>
          </div>
        ) : null}

        {cred && active ? (
          <div className="grid gap-6 px-4 py-5 sm:grid-cols-2 sm:px-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Time remaining</p>
              <p className="mt-1 font-mono text-3xl font-semibold text-ink sm:text-4xl" aria-live="polite">
                {mounted ? formatRemaining(remainingMs) : "--"}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <ClockIcon className="h-4 w-4" /> Ends {mounted ? formatDateTime(cred.validUntil) : "…"}
              </p>
            </div>
            <div>
              {userpass ? (
                <>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Wi-Fi login</p>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1">
                    <dt className="text-sm text-muted">Username</dt>
                    <dd className="font-mono text-2xl font-semibold text-brand-700">{code}</dd>
                    <dt className="text-sm text-muted">Password</dt>
                    <dd className="font-mono text-2xl font-semibold tracking-wider text-brand-700">{password}</dd>
                  </dl>
                  <button onClick={copy} className="mt-1 text-sm font-medium text-brand-700 hover:underline">
                    {copied ? "Copied" : "Copy"}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Access code</p>
                  <div className="mt-1 flex items-center gap-3">
                    <p className="font-mono text-3xl font-semibold tracking-wider text-brand-700">{formatAccessCode(code)}</p>
                    <button onClick={copy} className="text-sm font-medium text-brand-700 hover:underline">
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </>
              )}
              <p className="mt-1 text-sm text-muted">
                Works on {cred.maxDevices} device{cred.maxDevices > 1 ? "s" : ""} at a time.
              </p>
            </div>
          </div>
        ) : null}

        {cred && active ? (
          <div className="border-t border-line px-4 py-4 sm:px-5">
            {status.state === "PROVISIONING" ? (
              <p className="flex items-center gap-2 text-sm text-ink-soft">
                <Spinner /> Payment confirmed. Activating your code on the Wi-Fi network… This usually takes a few seconds.
              </p>
            ) : status.state === "ONLINE" ? (
              <p className="flex items-center gap-2 text-sm text-ok">
                <DevicesIcon className="h-4 w-4" /> Connected on {status.activeSessions.length} device{status.activeSessions.length > 1 ? "s" : ""}. You can browse now.
              </p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {autoConnect ? <p className="flex items-center gap-2 text-sm font-medium text-brand-700"><Spinner /> Connecting this phone to the Wi-Fi…</p> : null}
                <a href={hotspotLoginHref(code, password, login.url, login.returnTo)} className="inline-flex h-12 items-center justify-center rounded-md bg-brand-600 px-5 font-medium text-white hover:bg-brand-700">
                  Connect this device
                </a>
                {networkSimulated ? (
                  <Button variant="secondary" size="lg" onClick={simulateConnect}>
                    Simulate connect (test router)
                  </Button>
                ) : null}
                <p className="text-xs text-muted sm:ml-2">You must be connected to the Juthelink network. Or type it on the Wi-Fi login page.</p>
              </div>
            )}
            {connectMsg ? <p className="mt-2 text-sm text-ink-soft">{connectMsg}</p> : null}
            {cred.dataLimitBytes ? (
              <p className="mt-3 text-sm text-muted">
                Data used: {formatBytes(BigInt(cred.bytesUsed))} of {formatBytes(BigInt(cred.dataLimitBytes))}
              </p>
            ) : BigInt(cred.bytesUsed) > 0n ? (
              <p className="mt-3 text-sm text-muted">Data used: {formatBytes(BigInt(cred.bytesUsed))}</p>
            ) : null}
          </div>
        ) : null}

        {status.state === "EXPIRED" ? (
          <div className="px-4 py-6 text-center sm:px-5">
            <p className="font-semibold">Your Wi-Fi time has ended</p>
            <p className="mt-1 text-sm text-muted">Buy a new pass to continue browsing. Your history is kept.</p>
            <LinkButton href="/plans" className="mt-4">
              Renew now
            </LinkButton>
          </div>
        ) : null}
        {status.state === "REVOKED" ? (
          <div className="px-4 py-6 text-center text-sm text-muted sm:px-5">Your access was ended by our support team. Please contact us for help.</div>
        ) : null}
      </Card>

      {active ? (
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/plans" variant="secondary">
            Add more time
          </LinkButton>
          <NotifyButton />
        </div>
      ) : null}
    </div>
  );
}

function StateBadge({ state }: { state: AccessStatusDto["state"] }) {
  const map: Record<AccessStatusDto["state"], [string, "ok" | "brand" | "warn" | "bad" | "neutral"]> = {
    ONLINE: ["Online", "ok"],
    READY: ["Active", "brand"],
    PROVISIONING: ["Activating", "warn"],
    SCHEDULED: ["Scheduled", "neutral"],
    EXPIRED: ["Expired", "bad"],
    REVOKED: ["Revoked", "bad"],
    NONE: ["No pass", "neutral"],
  };
  const [label, tone] = map[state];
  return <Badge tone={tone}>{label}</Badge>;
}

async function showLocalNotification(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: "/icons/icon-192.png", tag: "expiry" });
    else new Notification(title, { body, icon: "/icons/icon-192.png" });
  } catch {
    // notifications unsupported in this context
  }
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Opt-in for expiry reminders. With Web Push configured and a registered service worker, reminders
 * can arrive while the app is closed (browser/OS permitting); otherwise only while the page is open.
 */
function NotifyButton() {
  const permission = useSyncExternalStore(
    subscribeNever,
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
    () => "default",
  );
  const [action, setState] = useState<"idle" | "busy" | "on" | "denied">("idle");
  const [note, setNote] = useState<string | null>(null);
  const state = action !== "idle" ? action : permission === "granted" ? "on" : permission === "denied" ? "denied" : permission === "unsupported" ? "unsupported" : "idle";

  async function enable() {
    setState("busy");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setState("denied");
    try {
      const { publicKey } = await api<{ publicKey: string | null }>("/api/push/key");
      const reg = await navigator.serviceWorker?.getRegistration();
      if (publicKey && reg && "pushManager" in reg) {
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
        await api("/api/push/subscribe", { body: sub.toJSON() });
        setNote("Reminders on. They can arrive even when this app is closed, if your phone allows it.");
      } else {
        setNote("Reminders on while this page is open. Install the app for reminders when closed.");
      }
      setState("on");
    } catch {
      setNote("Reminders on while this page is open.");
      setState("on");
    }
  }

  if (state === "unsupported") return null;
  return (
    <div className="flex flex-col">
      <Button variant="secondary" onClick={enable} disabled={state === "on" || state === "denied"} loading={state === "busy"}>
        {state === "on" ? "Reminders on" : state === "denied" ? "Notifications blocked" : "Remind me before it ends"}
      </Button>
      {note ? <p className="mt-1 max-w-xs text-xs text-muted">{note}</p> : null}
    </div>
  );
}
