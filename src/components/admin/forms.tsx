"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useAdminApi } from "./admin-context";

function useSubmit() {
  const call = useAdminApi();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  async function submit<T>(path: string, method: string, body: unknown, okMsg?: string): Promise<T | null> {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await call<T>(path, { method, body });
      router.refresh();
      if (okMsg) setOk(okMsg);
      return res;
    } catch (err) {
      setError(err instanceof ApiError ? (err.details?.map((d) => `${d.path}: ${d.message}`).join("; ") || err.message) : "Request failed");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { submit, busy, error, ok };
}

export interface ProfileValue {
  id?: string;
  routerName: string;
  description: string;
  rateLimit: string;
  sharedUsers: number;
  idleTimeout: string;
  keepaliveTimeout: string;
  statusAutorefresh: string;
}

const EMPTY_PROFILE: ProfileValue = { routerName: "", description: "", rateLimit: "", sharedUsers: 1, idleTimeout: "none", keepaliveTimeout: "3h", statusAutorefresh: "1m" };

/** Create or edit a router user profile (speed, devices, timeouts). Push to the router with "Push profiles". */
export function ProfileForm({ initial, onDone }: { initial?: ProfileValue; onDone?: () => void }) {
  const { submit, busy, error } = useSubmit();
  const [v, setV] = useState<ProfileValue>(initial ?? EMPTY_PROFILE);
  const set = <K extends keyof ProfileValue>(k: K, val: ProfileValue[K]) => setV((s) => ({ ...s, [k]: val }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const { id, ...body } = v;
        const payload = { ...body, rateLimit: v.rateLimit || null, idleTimeout: v.idleTimeout || null, keepaliveTimeout: v.keepaliveTimeout || null, statusAutorefresh: v.statusAutorefresh || null };
        const res = await submit(id ? `/api/admin/profiles/${id}` : "/api/admin/profiles", id ? "PUT" : "POST", payload);
        if (res) {
          if (!id) setV(EMPTY_PROFILE);
          onDone?.();
        }
      }}
    >
      <Field label="Router profile name" htmlFor={`pn-${v.id ?? "new"}`}><Input id={`pn-${v.id ?? "new"}`} value={v.routerName} onChange={(e) => set("routerName", e.target.value)} placeholder="starling-weekly" /></Field>
      <Field label="Speed (upload/download)" htmlFor={`pr-${v.id ?? "new"}`} hint="e.g. 5M/10M"><Input id={`pr-${v.id ?? "new"}`} value={v.rateLimit} onChange={(e) => set("rateLimit", e.target.value)} placeholder="5M/10M" /></Field>
      <Field label="Devices at once (shared users)" htmlFor={`ps-${v.id ?? "new"}`}><Input id={`ps-${v.id ?? "new"}`} type="number" min={1} max={10} value={v.sharedUsers} onChange={(e) => set("sharedUsers", Number(e.target.value))} /></Field>
      <Field label="Description" htmlFor={`pd-${v.id ?? "new"}`}><Input id={`pd-${v.id ?? "new"}`} value={v.description} onChange={(e) => set("description", e.target.value)} /></Field>
      <Field label="Idle timeout" htmlFor={`pi-${v.id ?? "new"}`} hint="none = never log out an idle user"><Input id={`pi-${v.id ?? "new"}`} value={v.idleTimeout} onChange={(e) => set("idleTimeout", e.target.value)} /></Field>
      <Field label="Keepalive timeout" htmlFor={`pk-${v.id ?? "new"}`} hint="3h stops one login hopping between phones"><Input id={`pk-${v.id ?? "new"}`} value={v.keepaliveTimeout} onChange={(e) => set("keepaliveTimeout", e.target.value)} /></Field>
      <Field label="Status page refresh" htmlFor={`pa-${v.id ?? "new"}`}><Input id={`pa-${v.id ?? "new"}`} value={v.statusAutorefresh} onChange={(e) => set("statusAutorefresh", e.target.value)} /></Field>
      <div className="flex items-end gap-2">
        <Button type="submit" loading={busy} className="w-full">{v.id ? "Save" : "Add profile"}</Button>
        {onDone && v.id ? <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button> : null}
      </div>
      {error ? <div className="sm:col-span-4"><Alert tone="bad">{error}</Alert></div> : null}
    </form>
  );
}

export function ProfileEditButton({ value }: { value: ProfileValue }) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Edit</Button>;
  return (
    <div className="mt-2 rounded-md border border-line bg-white p-3">
      <ProfileForm initial={value} onDone={() => setOpen(false)} />
    </div>
  );
}

export function StaffCreateForm() {
  const { submit, busy, error, ok } = useSubmit();
  const [v, setV] = useState({ email: "", name: "", role: "SUPPORT", password: "" });
  return (
    <form
      className="grid gap-3 sm:grid-cols-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await submit("/api/admin/staff", "POST", v, "Account created.");
        if (res) setV({ email: "", name: "", role: "SUPPORT", password: "" });
      }}
    >
      <Field label="Name" htmlFor="sn"><Input id="sn" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field label="Email" htmlFor="se"><Input id="se" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
      <Field label="Role" htmlFor="sr">
        <Select id="sr" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>
          <option value="VIEWER">Viewer (read only)</option>
          <option value="SUPPORT">Support</option>
          <option value="ADMIN">Administrator</option>
          <option value="SUPER_ADMIN">Super admin</option>
        </Select>
      </Field>
      <Field label="Temporary password" htmlFor="sp"><Input id="sp" type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} /></Field>
      <div className="flex items-end"><Button type="submit" loading={busy} className="w-full">Create</Button></div>
      {error ? <div className="sm:col-span-5"><Alert tone="bad">{error}</Alert></div> : null}
      {ok ? <div className="sm:col-span-5"><Alert tone="ok">{ok}</Alert></div> : null}
    </form>
  );
}

export function StaffRoleSelect({ id, role, disabled }: { id: string; role: string; disabled?: boolean }) {
  const { submit, busy, error } = useSubmit();
  return (
    <span className="inline-flex flex-col">
      <Select
        aria-label="Role"
        className="h-8! w-40 text-sm"
        value={role}
        disabled={disabled || busy}
        onChange={(e) => {
          if (window.confirm(`Change role to ${e.target.value}? Their sessions will be signed out.`)) submit(`/api/admin/staff/${id}`, "PATCH", { role: e.target.value });
        }}
      >
        <option value="VIEWER">Viewer</option>
        <option value="SUPPORT">Support</option>
        <option value="ADMIN">Administrator</option>
        <option value="SUPER_ADMIN">Super admin</option>
      </Select>
      {error ? <span className="mt-1 text-xs text-bad">{error}</span> : null}
    </span>
  );
}

export function ResetLinkButton({ id }: { id: string }) {
  const { submit, busy, error } = useSubmit();
  const [url, setUrl] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start">
      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        onClick={async () => {
          const res = await submit<{ url: string }>(`/api/admin/staff/${id}/reset-link`, "POST", {});
          if (res) setUrl(res.url);
        }}
      >
        Reset link
      </Button>
      {url ? <code className="mt-1 max-w-xs break-all rounded bg-surface p-1 text-[11px]">{url}</code> : null}
      {error ? <span className="text-xs text-bad">{error}</span> : null}
    </span>
  );
}

export interface SettingsValue {
  businessName: string;
  supportPhone: string;
  supportWhatsapp: string;
  supportHours: string;
  location: string;
  renewalMode: "EXTEND" | "IMMEDIATE";
  warningMinutes: number[];
  paymentTimeoutMinutes: number;
  maxPendingPaymentsPerPhone: number;
  routerExpiryScheduler: boolean;
  sessionSyncSeconds: number;
}

export function SettingsForm({ initial, readOnly }: { initial: SettingsValue; readOnly: boolean }) {
  const { submit, busy, error, ok } = useSubmit();
  const [v, setV] = useState(initial);
  const [warn, setWarn] = useState(initial.warningMinutes.join(", "));
  const set = <K extends keyof SettingsValue>(k: K, val: SettingsValue[K]) => setV((s) => ({ ...s, [k]: val }));
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const warningMinutes = warn.split(/[,\s]+/).filter(Boolean).map(Number);
        submit("/api/admin/settings", "PUT", { ...v, warningMinutes }, "Settings saved.");
      }}
    >
      <fieldset disabled={readOnly} className="contents">
        <Field label="Business name" htmlFor="bn"><Input id="bn" value={v.businessName} onChange={(e) => set("businessName", e.target.value)} /></Field>
        <Field label="Location (shown in footer)" htmlFor="loc"><Input id="loc" value={v.location} onChange={(e) => set("location", e.target.value)} /></Field>
        <Field label="Support phone" htmlFor="sp"><Input id="sp" value={v.supportPhone} onChange={(e) => set("supportPhone", e.target.value)} /></Field>
        <Field label="Support WhatsApp" htmlFor="sw"><Input id="sw" value={v.supportWhatsapp} onChange={(e) => set("supportWhatsapp", e.target.value)} /></Field>
        <Field label="Support hours" htmlFor="sh"><Input id="sh" value={v.supportHours} onChange={(e) => set("supportHours", e.target.value)} /></Field>
        <Field label="When a customer buys again before expiry" htmlFor="rm">
          <Select id="rm" value={v.renewalMode} onChange={(e) => set("renewalMode", e.target.value as SettingsValue["renewalMode"])}>
            <option value="EXTEND">Add time after the current pass (same code)</option>
            <option value="IMMEDIATE">Start a separate pass now (new code)</option>
          </Select>
        </Field>
        <Field label="Expiry warnings (minutes before)" htmlFor="wm" hint="Comma separated, e.g. 15, 5, 1"><Input id="wm" value={warn} onChange={(e) => setWarn(e.target.value)} /></Field>
        <Field label="Payment approval window (minutes)" htmlFor="pt"><Input id="pt" type="number" min={2} max={60} value={v.paymentTimeoutMinutes} onChange={(e) => set("paymentTimeoutMinutes", Number(e.target.value))} /></Field>
        <Field label="Max pending payments per phone" htmlFor="mp"><Input id="mp" type="number" min={1} max={10} value={v.maxPendingPaymentsPerPhone} onChange={(e) => set("maxPendingPaymentsPerPhone", Number(e.target.value))} /></Field>
        <Field label="Router session poll interval (seconds)" htmlFor="ss"><Input id="ss" type="number" min={15} max={3600} value={v.sessionSyncSeconds} onChange={(e) => set("sessionSyncSeconds", Number(e.target.value))} /></Field>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={v.routerExpiryScheduler} onChange={(e) => set("routerExpiryScheduler", e.target.checked)} />
          <span>
            Router-side expiry backstop: also add a RouterOS scheduler entry that removes each user at its end time, so access ends on time even if the server
            cannot reach the router. Requires correct router clock (NTP).
          </span>
        </label>
        {!readOnly ? <div className="sm:col-span-2"><Button type="submit" loading={busy}>Save settings</Button></div> : null}
      </fieldset>
      {error ? <div className="sm:col-span-2"><Alert tone="bad">{error}</Alert></div> : null}
      {ok ? <div className="sm:col-span-2"><Alert tone="ok">{ok}</Alert></div> : null}
    </form>
  );
}
