"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { formatDuration } from "@/lib/format";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useAdminApi } from "./admin-context";

export interface PackageFormValue {
  id?: string;
  slug: string;
  name: string;
  description: string;
  priceXaf: number;
  promoPriceXaf: number | null;
  promoEndsAt: string | null;
  durationMinutes: number;
  dataLimitMb: number | null;
  rateLimit: string | null;
  maxDevices: number;
  usagePolicy: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  sortOrder: number;
  isFeatured: boolean;
  networkProfileId: string | null;
}

const UNITS = [
  ["minutes", 1],
  ["hours", 60],
  ["days", 1440],
  ["weeks", 10080],
  ["months (30 d)", 43200],
] as const;

function splitDuration(min: number): [number, number] {
  for (const [, f] of [...UNITS].reverse()) if (min % f === 0) return [min / f, f];
  return [min, 1];
}

export function PackageEditor({ initial, profiles, onDone }: { initial: PackageFormValue; profiles: { id: string; routerName: string }[]; onDone?: () => void }) {
  const call = useAdminApi();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [amount, setAmount] = useState(splitDuration(initial.durationMinutes)[0]);
  const [unit, setUnit] = useState(splitDuration(initial.durationMinutes)[1]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof PackageFormValue>(k: K, val: PackageFormValue[K]) => setV((s) => ({ ...s, [k]: val }));
  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    const { id, ...body } = { ...v, durationMinutes: Math.round(amount * unit) };
    try {
      await call(id ? `/api/admin/packages/${id}` : "/api/admin/packages", { method: id ? "PUT" : "POST", body });
      router.refresh();
      onDone?.();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Name" htmlFor="name" error={errors.name}>
        <Input id="name" value={v.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="Slug (URL)" htmlFor="slug" error={errors.slug}>
        <Input id="slug" value={v.slug} onChange={(e) => set("slug", e.target.value)} />
      </Field>
      <Field label="Price (XAF, whole francs)" htmlFor="price" error={errors.priceXaf}>
        <Input id="price" type="number" min={25} step={1} value={v.priceXaf} onChange={(e) => set("priceXaf", Number(e.target.value))} />
      </Field>
      <Field label="Duration" htmlFor="dur" error={errors.durationMinutes} hint={`= ${formatDuration(Math.max(1, Math.round(amount * unit)))}`}>
        <div className="flex gap-2">
          <Input id="dur" type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          <Select value={unit} onChange={(e) => setUnit(Number(e.target.value))} aria-label="Duration unit">
            {UNITS.map(([l, f]) => (
              <option key={f} value={f}>{l}</option>
            ))}
          </Select>
        </div>
      </Field>
      <Field label="Devices at the same time" htmlFor="dev" error={errors.maxDevices}>
        <Input id="dev" type="number" min={1} max={10} value={v.maxDevices} onChange={(e) => set("maxDevices", Number(e.target.value))} />
      </Field>
      <Field label="Data allowance (MB, empty = no cap)" htmlFor="data" error={errors.dataLimitMb}>
        <Input id="data" type="number" min={1} value={v.dataLimitMb ?? ""} onChange={(e) => set("dataLimitMb", num(e.target.value))} />
      </Field>
      <Field label="Speed limit (upload/download)" htmlFor="rate" error={errors.rateLimit} hint="MikroTik format, e.g. 1M/3M. Empty = profile default.">
        <Input id="rate" value={v.rateLimit ?? ""} onChange={(e) => set("rateLimit", e.target.value.trim() || null)} />
      </Field>
      <Field label="Router profile" htmlFor="profile" error={errors.networkProfileId}>
        <Select id="profile" value={v.networkProfileId ?? ""} onChange={(e) => set("networkProfileId", e.target.value || null)}>
          <option value="">default</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.routerName}</option>
          ))}
        </Select>
      </Field>
      <Field label="Promotional price (optional)" htmlFor="promo" error={errors.promoPriceXaf}>
        <Input id="promo" type="number" min={0} value={v.promoPriceXaf ?? ""} onChange={(e) => set("promoPriceXaf", num(e.target.value))} />
      </Field>
      <Field label="Promotion ends (optional)" htmlFor="promoEnd" error={errors.promoEndsAt}>
        <Input
          id="promoEnd"
          type="datetime-local"
          value={v.promoEndsAt ? v.promoEndsAt.slice(0, 16) : ""}
          onChange={(e) => set("promoEndsAt", e.target.value ? new Date(e.target.value).toISOString() : null)}
        />
      </Field>
      <Field label="Status" htmlFor="status" error={errors.status}>
        <Select id="status" value={v.status} onChange={(e) => set("status", e.target.value as PackageFormValue["status"])}>
          <option value="ACTIVE">Active (on sale)</option>
          <option value="INACTIVE">Inactive (hidden)</option>
          <option value="ARCHIVED">Archived (permanent)</option>
        </Select>
      </Field>
      <Field label="Sort order" htmlFor="sort">
        <Input id="sort" type="number" min={0} value={v.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Description" htmlFor="desc" error={errors.description}>
          <Textarea id="desc" rows={2} value={v.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Usage policy shown to customers" htmlFor="policy">
          <Textarea id="policy" rows={2} value={v.usagePolicy} onChange={(e) => set("usagePolicy", e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.isFeatured} onChange={(e) => set("isFeatured", e.target.checked)} className="h-4 w-4 accent-brand-600" /> Highlight as popular
      </label>
      {error ? (
        <div className="sm:col-span-2">
          <Alert tone="bad">{error}</Alert>
        </div>
      ) : null}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" loading={busy}>
          {v.id ? "Save changes" : "Create package"}
        </Button>
        {onDone ? (
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted sm:col-span-2">Changes apply to new purchases only. Existing passes keep the terms they were bought with.</p>
    </form>
  );
}

export function PackageRowEditor({ value, profiles, label }: { value: PackageFormValue; profiles: { id: string; routerName: string }[]; label: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  return (
    <div className="mt-3 w-full rounded-md border border-line bg-white p-4">
      <PackageEditor initial={value} profiles={profiles} onDone={() => setOpen(false)} />
    </div>
  );
}
