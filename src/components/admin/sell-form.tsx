"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, fieldErrors } from "@/lib/api-client";
import { formatAccessCode, formatDateTime, formatDuration, formatXaf } from "@/lib/format";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import { PhoneInput } from "@/components/ui/inputs";
import { Button } from "@/components/ui/button";
import { useAdminApi } from "./admin-context";

interface Pkg {
  id: string;
  name: string;
  priceXaf: number;
  durationMinutes: number;
}

interface Sale {
  credentialId: string;
  reference: string;
  packageName: string;
  amountXaf: number;
  username: string;
  password: string;
  style: "code" | "userpass";
  validUntil: string;
  maxDevices: number;
}

/** Counter sale: take cash, create the customer's Wi-Fi login, print the slip. */
export function SellForm({ packages, networkName, simulatedRouter }: { packages: Pkg[]; networkName: string; simulatedRouter: boolean }) {
  const call = useAdminApi();
  const router = useRouter();
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [style, setStyle] = useState<"userpass" | "code">("userpass");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sale, setSale] = useState<Sale | null>(null);
  const pkg = packages.find((p) => p.id === packageId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pkg || !window.confirm(`Confirm you received ${formatXaf(pkg.priceXaf)} in cash for ${pkg.name}?`)) return;
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const res = await call<{ sale: Sale }>("/api/admin/sales", { body: { packageId, phone, name, style, idempotencyKey: key } });
      setSale(res.sale);
      router.refresh();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err instanceof ApiError ? err.message : "Sale failed");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setSale(null);
    setPhone("");
    setName("");
    setKey(crypto.randomUUID());
  }

  if (sale) {
    return (
      <div>
        <div id="slip" className="mx-auto max-w-sm rounded-lg border-2 border-dashed border-line bg-white p-5 text-center print:border-ink">
          <p className="text-sm font-semibold">{networkName}</p>
          <p className="text-xs text-muted">
            {sale.packageName} · {formatXaf(sale.amountXaf)} · paid cash
          </p>
          {sale.style === "userpass" ? (
            <dl className="mx-auto mt-4 grid w-fit grid-cols-[auto_auto] gap-x-4 gap-y-1 text-left">
              <dt className="text-sm text-muted">Username</dt>
              <dd className="font-mono text-2xl font-bold">{sale.username}</dd>
              <dt className="text-sm text-muted">Password</dt>
              <dd className="font-mono text-2xl font-bold tracking-wider">{sale.password}</dd>
            </dl>
          ) : (
            <p className="mt-4 font-mono text-3xl font-bold tracking-wider">{formatAccessCode(sale.username)}</p>
          )}
          <p className="mt-3 text-xs text-muted">
            Valid until {formatDateTime(sale.validUntil)} · {sale.maxDevices} device{sale.maxDevices > 1 ? "s" : ""}
          </p>
          <ol className="mt-4 space-y-1 border-t border-line pt-3 text-left text-xs text-ink-soft">
            <li>1. Connect to the “{networkName}” Wi-Fi.</li>
            <li>2. Open any website; the login page appears.</li>
            <li>3. {sale.style === "userpass" ? "Tap “Username & password” and enter the details above." : "Enter the code above."} Tap Connect.</li>
          </ol>
          <p className="mt-3 text-[10px] text-muted">Ref {sale.reference}</p>
        </div>
        {simulatedRouter ? <p className="mt-3 text-center text-xs text-warn">Test mode: the router is simulated, so this login only works on the fake router.</p> : null}
        <div className="mt-4 flex justify-center gap-2 print:hidden">
          <a href={`/admin/receipt/${sale.credentialId}?print=1`} className="inline-flex h-10 items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
            Print receipt
          </a>
          <Button variant="secondary" onClick={next}>
            New sale
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Package" htmlFor="s-pkg">
        <Select id="s-pkg" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {formatXaf(p.priceXaf)} · {formatDuration(p.durationMinutes)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Customer phone" htmlFor="s-phone" error={errors.phone} hint="Lets them see their time and sign up online later.">
        <PhoneInput id="s-phone" value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!errors.phone} />
      </Field>
      <Field label="Customer name (optional)" htmlFor="s-name" hint="Used to make the username, e.g. awa482.">
        <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Login type</legend>
        <div className="grid grid-cols-2 gap-2">
          {([
            ["userpass", "Username + password"],
            ["code", "Single access code"],
          ] as const).map(([v, l]) => (
            <label key={v} className={`flex h-11 cursor-pointer items-center justify-center rounded-md border text-sm font-medium ${style === v ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line text-ink-soft"}`}>
              <input type="radio" className="sr-only" checked={style === v} onChange={() => setStyle(v)} />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      {error ? (
        <div className="sm:col-span-2">
          <Alert tone="bad">{error}</Alert>
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" loading={busy} disabled={!pkg}>
          Record cash sale {pkg ? `· ${formatXaf(pkg.priceXaf)}` : ""}
        </Button>
      </div>
    </form>
  );
}
