"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { normalizeCameroonPhone } from "@/lib/phone";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

function PhoneInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex">
      <span className="inline-flex items-center rounded-l-md border border-r-0 border-line bg-surface px-3 text-sm text-muted">+237</span>
      <Input id={id} inputMode="tel" autoComplete="tel-national" placeholder="6 70 00 00 00" value={value} onChange={(e) => onChange(e.target.value)} className="rounded-l-none" required />
    </div>
  );
}

/** Sign back in with the paying phone number and any access code received. */
export function RecoverForm() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const p = normalizeCameroonPhone(phone);
    if (!p) return setError("Enter the Mobile Money number you paid with.");
    setBusy(true);
    try {
      await api("/api/me/recover", { body: { phone: p, code } });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Phone number" htmlFor="r-phone">
        <PhoneInput id="r-phone" value={phone} onChange={setPhone} />
      </Field>
      <Field label="Access code" htmlFor="r-code" hint="Any code you received, even an expired one.">
        <Input id="r-code" autoCapitalize="characters" autoComplete="off" placeholder="ABCD-EFGH" value={code} onChange={(e) => setCode(e.target.value)} className="font-mono uppercase" required />
      </Field>
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <Button type="submit" className="w-full" loading={busy}>
        Show my access
      </Button>
    </form>
  );
}

/** Redeem a prepaid voucher card bought for cash. */
export function VoucherForm() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const p = normalizeCameroonPhone(phone);
    if (!p) return setError("Enter your phone number. It lets you recover your access later.");
    setBusy(true);
    try {
      await api("/api/vouchers/redeem", { body: { phone: p, code } });
      router.push("/account?redeemed=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not redeem the voucher.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Voucher code" htmlFor="v-code" hint="12 characters printed on the card.">
        <Input id="v-code" autoCapitalize="characters" autoComplete="off" placeholder="XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} className="font-mono uppercase" required />
      </Field>
      <Field label="Your phone number" htmlFor="v-phone">
        <PhoneInput id="v-phone" value={phone} onChange={setPhone} />
      </Field>
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <Button type="submit" className="w-full" loading={busy}>
        Redeem voucher
      </Button>
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="text-sm text-muted hover:text-ink"
      onClick={async () => {
        await api("/api/me/logout", { body: {} }).catch(() => undefined);
        router.refresh();
      }}
    >
      Sign out on this device
    </button>
  );
}
