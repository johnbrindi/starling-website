"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { useAdminApi } from "./admin-context";

/** Speed tier + data allowance for one login. */
export function LimitsForm({ credentialId, speed, dataLimitMb, tiers }: { credentialId: string; speed: string | null; dataLimitMb: number | null; tiers: { key: string; label: string }[] }) {
  const call = useAdminApi();
  const router = useRouter();
  const [s, setS] = useState(speed ?? "");
  const [mb, setMb] = useState(dataLimitMb ? String(dataLimitMb) : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const n = mb.trim() ? Math.round(Number(mb)) : null;
      if (n !== null && (!Number.isFinite(n) || n < 10)) throw new ApiError("Data limit must be at least 10 MB (or empty for no limit).", 400);
      const r = await call<{ message: string }>(`/api/admin/credentials/${credentialId}/limits`, { body: { speed: s || null, dataLimitMb: n } });
      setMsg(r.message);
      router.refresh();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-muted">
        Speed
        <select value={s} onChange={(e) => setS(e.target.value)} className="mt-0.5 block h-9 rounded-md border border-line bg-white px-2 text-sm text-ink">
          <option value="">Plan default</option>
          {tiers.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted">
        Data limit (MB)
        <input value={mb} onChange={(e) => setMb(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="No limit" className="mt-0.5 block h-9 w-28 rounded-md border border-line px-2 text-sm text-ink" />
      </label>
      <Button size="sm" variant="secondary" onClick={save} loading={busy}>Save limits</Button>
      {msg ? <p className="w-full text-xs text-muted">{msg}</p> : null}
    </div>
  );
}
