"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError, fieldErrors } from "@/lib/api-client";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { PasswordInput, PhoneInput } from "@/components/ui/inputs";
import { SubmitButton } from "@/components/ui/submit-button";

function useAuthSubmit(path: string, next: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function submit(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      await api(path, { body });
      router.replace(next);
      router.refresh();
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }
  return { submit, busy, error, errors };
}

export function RegisterForm({ next }: { next: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { submit, busy, error, errors } = useAuthSubmit("/api/auth/register", next);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!agree) return setLocalError("Please accept the terms to create your account.");
        setLocalError(null);
        submit({ name, phone, password });
      }}
    >
      <Field label="Full name" htmlFor="name" error={errors.name}>
        <Input id="name" autoComplete="name" autoCapitalize="words" placeholder="e.g. Marie Ngono" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Phone number" htmlFor="phone" error={errors.phone} hint="You will sign in with this number.">
        <PhoneInput id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!errors.phone} required />
      </Field>
      <Field label="Create a password" htmlFor="password" error={errors.password} hint="At least 8 characters.">
        <PasswordInput id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} required />
      </Field>
      <label className="flex items-start gap-2.5 text-sm text-ink-soft">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded accent-brand-600" />
        <span>
          I accept the <Link href="/terms" className="font-medium text-brand-700 underline">terms</Link> and{" "}
          <Link href="/privacy" className="font-medium text-brand-700 underline">privacy policy</Link>.
        </span>
      </label>
      {localError || (error && !Object.keys(errors).length) ? <Alert tone="bad">{localError ?? error}</Alert> : null}
      {error && errors.phone?.includes("Forgot") ? (
        <p className="text-sm">
          <Link href={`/forgot-password?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700 underline">
            Set a password for this number
          </Link>
        </p>
      ) : null}
      <SubmitButton size="lg" className="w-full" loading={busy}>
        Create account
      </SubmitButton>
    </form>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const { submit, busy, error, errors } = useAuthSubmit("/api/auth/login", next);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit({ phone, password });
      }}
    >
      <Field label="Phone number" htmlFor="phone" error={errors.phone}>
        <PhoneInput id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!errors.phone} required autoFocus />
      </Field>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium text-ink">
            Password
          </label>
          <Link href={`/forgot-password?next=${encodeURIComponent(next)}`} className="text-sm font-medium text-brand-700">
            Forgot password?
          </Link>
        </div>
        <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <SubmitButton size="lg" className="w-full" loading={busy}>
        Sign in
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ next }: { next: string }) {
  const [phone, setPhone] = useState("");
  const [proof, setProof] = useState("");
  const [password, setPassword] = useState("");
  const { submit, busy, error, errors } = useAuthSubmit("/api/auth/reset", next);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit({ phone, proof, password });
      }}
    >
      <Field label="Phone number" htmlFor="phone" error={errors.phone}>
        <PhoneInput id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!errors.phone} required />
      </Field>
      <Field
        label="Verification code"
        htmlFor="proof"
        error={errors.proof}
        hint="Any Wi-Fi access code you received on this number (e.g. ABCD-EFGH), or the 6-digit code from our support team."
      >
        <Input id="proof" autoComplete="one-time-code" autoCapitalize="characters" className="font-mono uppercase tracking-wider" value={proof} onChange={(e) => setProof(e.target.value)} required />
      </Field>
      <Field label="New password" htmlFor="password" error={errors.password} hint="At least 8 characters.">
        <PasswordInput id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} required />
      </Field>
      {error && !Object.keys(errors).length ? <Alert tone="bad">{error}</Alert> : null}
      <SubmitButton size="lg" className="w-full" loading={busy}>
        Set new password and sign in
      </SubmitButton>
    </form>
  );
}
