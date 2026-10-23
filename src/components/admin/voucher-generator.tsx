"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { Alert, Field, Input, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useAdminApi } from "./admin-context";

export function VoucherGenerator({ packages }: { packages: { id: string; name: string }[] }) {
  const call = useAdminApi();
  const router = useRouter();
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "");
  const [count, setCount] = useState(20);
  const [batch, setBatch] = useState(`B${new Date().toISOString().slice(2, 10).replace(/-/g, "")}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ batch: string; packageName: string; codes: string[] } | null>(null);

  if (result)
    return (
      <div>
        <Alert tone="warn" title="Print or save these codes now">They are shown only once and are not stored in readable form.</Alert>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
          {result.codes.map((c) => (
            <div key={c} className="rounded border border-dashed border-line p-2 text-center">
              <p className="text-[10px] uppercase text-muted">{result.packageName}</p>
              <p className="font-mono text-sm font-semibold">{c}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2 print:hidden">
          <Button onClick={() => window.print()}>Print</Button>
          <Button variant="secondary" onClick={() => setResult(null)}>Done</Button>
        </div>
      </div>
    );

  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          setResult(await call("/api/admin/vouchers", { body: { packageId, count, batch } }));
          router.refresh();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Package" htmlFor="vp">
        <Select id="vp" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="How many" htmlFor="vc">
        <Input id="vc" type="number" min={1} max={500} value={count} onChange={(e) => setCount(Number(e.target.value))} />
      </Field>
      <Field label="Batch label" htmlFor="vb">
        <Input id="vb" value={batch} onChange={(e) => setBatch(e.target.value)} />
      </Field>
      <div className="flex items-end">
        <Button type="submit" loading={busy} className="w-full">Generate</Button>
      </div>
      {error ? <div className="sm:col-span-4"><Alert tone="bad">{error}</Alert></div> : null}
    </form>
  );
}
