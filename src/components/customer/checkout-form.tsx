"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { PackageDto } from "@/lib/types";
import { api, ApiError, fieldErrors } from "@/lib/api-client";
import { guessOperator, normalizeCameroonPhone } from "@/lib/phone";
import { formatDuration, formatXaf } from "@/lib/format";
import { loadHotspotContext } from "@/lib/hotspot";
import { Alert, Field } from "@/components/ui/primitives";
import { PhoneInput } from "@/components/ui/inputs";
import { SubmitButton } from "@/components/ui/submit-button";

type Channel = "cm.mtn" | "cm.orange";

export function CheckoutForm({ plan, defaultPhone, simulated }: { plan: PackageDto; defaultPhone?: string; simulated: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState(defaultPhone?.replace(/^\+237/, "") ?? "");
  const [channel, setChannel] = useState<Channel | null>(null);
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
      <Field label="Mobile Money number" htmlFor="phone" error={errors.phone} hint="The number that pays. Usually yours, but it can be someone else's.">
        <PhoneInput id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!errors.phone} required />
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

      {error && !Object.keys(errors).length ? <Alert tone="bad">{error}</Alert> : null}

      <SubmitButton size="lg" className="w-full" loading={busy}>
        Pay {formatXaf(plan.effectivePriceXaf)} for {formatDuration(plan.durationMinutes)}
      </SubmitButton>
      <p className="text-center text-xs text-muted">You will get a prompt on that phone. Enter your Mobile Money PIN there, never on this website.</p>
    </form>
  );
}
