"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { PackageDto } from "@/lib/types";
import { api, ApiError, fieldErrors } from "@/lib/api-client";
import { guessOperator, normalizeCameroonPhone } from "@/lib/phone";
import { formatDuration, formatXaf } from "@/lib/format";
import { loadHotspotContext } from "@/lib/hotspot";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

type Channel = "cm.mtn" | "cm.orange";

export function CheckoutForm({ plan, defaultPhone, simulated }: { plan: PackageDto; defaultPhone?: string; simulated: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState(defaultPhone?.replace(/^\+237/, "") ?? "");
  const [channel, setChannel] = useState<Channel | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // One key per form instance: double taps and retries reuse it, so the customer is charged once.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const normalized = normalizeCameroonPhone(phone);
  const guessed = useMemo(() => (normalized ? guessOperator(normalized) : null), [normalized]);
  const effectiveChannel: Channel | null = channel ?? (guessed === "MTN" ? "cm.mtn" : guessed === "ORANGE" ? "cm.orange" : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrors({});
    if (!normalized) return setErrors({ phone: "Enter a Cameroon mobile number, e.g. 6 70 00 00 00." });
    if (!effectiveChannel) return setErrors({ channel: "Choose MTN Mobile Money or Orange Money." });
    if (!agree) return setErrors({ agree: "Please accept the terms to continue." });
    setBusy(true);
    try {
      const hs = loadHotspotContext();
      const res = await api<{ payment: { id: string }; instructions: string | null }>("/api/checkout", {
        body: { packageId: plan.id, phone: normalized, channel: effectiveChannel, idempotencyKey, clientMac: hs?.mac, clientIp: hs?.ip },
      });
      if (res.instructions) sessionStorage.setItem(`pay:${res.payment.id}`, res.instructions);
      router.push(`/pay/${res.payment.id}`);
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err instanceof ApiError ? err.message : "Could not start the payment.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {simulated ? (
        <Alert tone="warn" title="Test mode">
          Payments are simulated. No money will be taken. Numbers ending in 0 succeed, ending in 1 fail.
        </Alert>
      ) : null}
      <Field label="Mobile Money number" htmlFor="phone" error={errors.phone} hint="The number that will pay. You will approve on this phone.">
        <div className="flex">
          <span className="inline-flex items-center rounded-l-md border border-r-0 border-line bg-surface px-3 text-sm text-muted">+237</span>
          <Input
            id="phone"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="6 70 00 00 00"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-l-none"
            aria-invalid={!!errors.phone}
            required
          />
        </div>
      </Field>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium text-ink">Pay with</legend>
        <div className="grid grid-cols-2 gap-2">
          {([
            ["cm.mtn", "MTN MoMo"],
            ["cm.orange", "Orange Money"],
          ] as const).map(([value, label]) => (
            <label
              key={value}
              className={`flex h-12 cursor-pointer items-center justify-center rounded-md border text-sm font-medium ${effectiveChannel === value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line text-ink-soft hover:bg-surface"}`}
            >
              <input type="radio" name="channel" value={value} className="sr-only" checked={effectiveChannel === value} onChange={() => setChannel(value)} />
              {label}
            </label>
          ))}
        </div>
        {errors.channel ? <p className="mt-1.5 text-sm text-bad">{errors.channel}</p> : null}
      </fieldset>

      <label className="flex items-start gap-2 text-sm text-ink-soft">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-line accent-brand-600" />
        <span>
          I accept the <a href="/terms" className="text-brand-700 underline">terms of service</a> and the fair-use policy.
        </span>
      </label>
      {errors.agree ? <p className="-mt-3 text-sm text-bad">{errors.agree}</p> : null}

      {error && !Object.keys(errors).length ? <Alert tone="bad">{error}</Alert> : null}

      <Button type="submit" size="lg" className="w-full" loading={busy}>
        Pay {formatXaf(plan.effectivePriceXaf)} for {formatDuration(plan.durationMinutes)}
      </Button>
      <p className="text-center text-xs text-muted">Your access starts as soon as the payment is confirmed.</p>
    </form>
  );
}
