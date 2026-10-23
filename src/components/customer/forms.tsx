"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError, fieldErrors } from "@/lib/api-client";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { PasswordInput } from "@/components/ui/inputs";
import { Button } from "@/components/ui/button";

/** Redeem a prepaid voucher card bought for cash. The pass is added to the signed-in account. */
export function VoucherForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/api/vouchers/redeem", { body: { code } });
      router.push("/account?redeemed=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? (fieldErrors(err).code ?? err.message) : "Could not redeem the voucher.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Voucher code" htmlFor="v-code" hint="The 12 characters printed on your card. Dashes are optional.">
        <Input
          id="v-code"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="h-12 text-center font-mono text-lg uppercase tracking-[0.2em]"
          required
        />
      </Field>
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.replace(/[^a-z0-9]/gi, "").length < 8}>
        Redeem voucher
      </Button>
    </form>
  );
}

export function ProfileForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          await api("/api/me/profile", { method: "PATCH", body: { name } });
          setMsg({ tone: "ok", text: "Name saved." });
          router.refresh();
        } catch (err) {
          setMsg({ tone: "bad", text: err instanceof ApiError ? (fieldErrors(err).name ?? err.message) : "Could not save." });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Full name" htmlFor="pf-name">
        <Input id="pf-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Button type="submit" variant="secondary" loading={busy} disabled={name.trim() === initialName}>
        Save name
      </Button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        setErrors({});
        try {
          await api("/api/me/password", { body: { current, password } });
          setCurrent("");
          setPassword("");
          setMsg({ tone: "ok", text: "Password changed. Other devices have been signed out." });
        } catch (err) {
          setErrors(fieldErrors(err));
          setMsg({ tone: "bad", text: err instanceof ApiError ? err.message : "Could not change the password." });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Current password" htmlFor="cp-current" error={errors.current}>
        <PasswordInput id="cp-current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="New password" htmlFor="cp-new" error={errors.password} hint="At least 8 characters.">
        <PasswordInput id="cp-new" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Button type="submit" variant="secondary" loading={busy} disabled={!current || password.length < 8}>
        Change password
      </Button>
    </form>
  );
}

export function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      className={className}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await api("/api/auth/logout", { body: {} }).catch(() => undefined);
        router.replace("/");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
