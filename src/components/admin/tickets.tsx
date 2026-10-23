"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, fieldErrors } from "@/lib/api-client";
import { formatDuration, formatXaf } from "@/lib/format";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useAdminApi } from "./admin-context";

interface Ticket {
  username: string;
  password: string;
  packageName: string;
  priceXaf: number;
  durationMinutes: number;
  activateBy: string;
}

/** Printable sheet: 2 columns on paper, cut along the dashed lines. */
export function TicketSheet({ batch, tickets, networkName, whatsapp, onClose }: { batch: string; tickets: Ticket[]; networkName: string; whatsapp: string; onClose: () => void }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-muted">
          Batch <span className="font-mono text-ink">{batch}</span> · {tickets.length} ticket{tickets.length === 1 ? "" : "s"}. Keep the sheet safe: each ticket works once.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => window.print()}>Print</Button>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 print:grid-cols-2" id="ticket-sheet">
        {tickets.map((t) => (
          <div key={t.username} className="break-inside-avoid rounded border-2 border-dashed border-line bg-white p-3 text-sm print:border-ink">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{networkName}</span>
              <span className="font-semibold">{formatXaf(t.priceXaf)}</span>
            </div>
            <p className="text-xs text-muted">
              {t.packageName} · {formatDuration(t.durationMinutes)} from first login
            </p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 font-mono">
              <dt className="text-xs text-muted">Username</dt>
              <dd className="text-lg font-bold">{t.username}</dd>
              {t.password !== t.username ? (
                <>
                  <dt className="text-xs text-muted">Password</dt>
                  <dd className="text-lg font-bold tracking-wider">{t.password}</dd>
                </>
              ) : null}
            </dl>
            <p className="mt-1 text-[11px] leading-snug text-ink-soft">
              Join “{networkName}” → open any website → {t.password !== t.username ? "tab “Username & password”" : "enter the code"} → Connect. Use before{" "}
              {new Date(t.activateBy).toLocaleDateString()}.{whatsapp ? ` Help: WhatsApp ${whatsapp}` : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TicketGenerator({ packages, networkName, whatsapp }: { packages: { id: string; name: string; priceXaf: number }[]; networkName: string; whatsapp: string }) {
  const call = useAdminApi();
  const router = useRouter();
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "");
  const [count, setCount] = useState(20);
  const [batch, setBatch] = useState(() => `T${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`);
  const [style, setStyle] = useState<"userpass" | "code">("userpass");
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<{ batch: string; tickets: Ticket[] } | null>(null);
  const pkg = packages.find((p) => p.id === packageId);

  if (sheet) return <TicketSheet {...sheet} networkName={networkName} whatsapp={whatsapp} onClose={() => setSheet(null)} />;

  return (
    <form
      noValidate
      className="grid gap-4 sm:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setErrors({});
        try {
          setSheet(await call("/api/admin/tickets", { body: { packageId, count, batch, style, activationDays: days } }));
          router.refresh();
        } catch (err) {
          setErrors(fieldErrors(err));
          setError(err instanceof ApiError ? err.message : "Failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Package" htmlFor="t-pkg">
        <Select id="t-pkg" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {formatXaf(p.priceXaf)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="How many tickets" htmlFor="t-count">
        <Input id="t-count" type="number" min={1} max={200} value={count} onChange={(e) => setCount(Number(e.target.value))} />
      </Field>
      <Field label="Batch name" htmlFor="t-batch" error={errors.batch}>
        <Input id="t-batch" value={batch} onChange={(e) => setBatch(e.target.value)} />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Login type</legend>
        <div className="grid grid-cols-2 gap-2">
          {([
            ["userpass", "Username + password"],
            ["code", "Single code"],
          ] as const).map(([v, l]) => (
            <label key={v} className={`flex h-10 cursor-pointer items-center justify-center rounded-md border text-sm font-medium ${style === v ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line text-ink-soft"}`}>
              <input type="radio" className="sr-only" checked={style === v} onChange={() => setStyle(v)} />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Unused tickets expire after (days)" htmlFor="t-days">
        <Input id="t-days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} />
      </Field>
      <div className="flex items-end">
        <Button type="submit" loading={busy} className="w-full" disabled={!pkg}>
          Generate {count} ticket{count === 1 ? "" : "s"}
        </Button>
      </div>
      {error ? (
        <div className="sm:col-span-3">
          <Alert tone="bad">{error}</Alert>
        </div>
      ) : null}
      {pkg ? (
        <p className="text-xs text-muted sm:col-span-3">
          Face value {formatXaf(pkg.priceXaf * count)}. Each ticket&apos;s time starts at its first login on the Wi-Fi.
        </p>
      ) : null}
    </form>
  );
}

export function ReprintButton({ batch, networkName, whatsapp }: { batch: string; networkName: string; whatsapp: string }) {
  const call = useAdminApi();
  const [sheet, setSheet] = useState<Ticket[] | null>(null);
  const [busy, setBusy] = useState(false);
  if (sheet)
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-surface p-4 print:static print:p-0">
        <TicketSheet batch={batch} tickets={sheet} networkName={networkName} whatsapp={whatsapp} onClose={() => setSheet(null)} />
      </div>
    );
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={busy}
      onClick={async () => {
        if (!window.confirm("Show the unused tickets of this batch again (logged in the audit trail)?")) return;
        setBusy(true);
        try {
          setSheet((await call<{ tickets: Ticket[] }>(`/api/admin/tickets/${encodeURIComponent(batch)}/reprint`, { body: {} })).tickets);
        } finally {
          setBusy(false);
        }
      }}
    >
      Reprint unused
    </Button>
  );
}
