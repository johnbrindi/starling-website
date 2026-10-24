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

export function CheckoutForm({ plan, defaultPhone, simulated }: { plan: PackageDto; defaultPhone?: string; simulated: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState(defaultPhone?.replace(/^\+237/, "") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // One key per form instance: double taps and retries reuse it, so the customer is charged once.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const normalized = normalizeCameroonPhone(phone);
  const guessed = useMemo(() => (normalized ? guessOperator(normalized) : null), [normalized]);
  // Juthelink accepts MTN Mobile Money only.
  const orange = guessed === "ORANGE";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrors({});
    if (!normalized) return setErrors({ phone: "Enter a Cameroon mobile number, e.g. 6 70 00 00 00." });
    if (orange) return setErrors({ phone: "Only MTN Mobile Money is accepted. Please use an MTN number." });
    setBusy(true);
    try {
      const hs = loadHotspotContext();
      const res = await api<{ payment: { id: string }; instructions: string | null }>("/api/checkout", {
        body: { packageId: plan.id, phone: normalized, channel: "cm.mtn", idempotencyKey, clientMac: hs?.mac, clientIp: hs?.ip },
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
      <Field label="MTN MoMo number" htmlFor="phone" error={errors.phone} hint="The MTN number that pays. Usually yours, but it can be someone else's.">
        <PhoneInput id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!errors.phone} required />
      </Field>


      {error && !Object.keys(errors).length ? <Alert tone="bad">{error}</Alert> : null}

      <SubmitButton size="lg" className="w-full" loading={busy}>
        Pay {formatXaf(plan.effectivePriceXaf)} for {formatDuration(plan.durationMinutes)}
      </SubmitButton>
      <p className="text-center text-xs text-muted">You will get a prompt on that phone. Enter your MTN MoMo PIN there, never on this website.</p>
    </form>
  );
}
