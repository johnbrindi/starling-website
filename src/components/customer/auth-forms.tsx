"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError, fieldErrors } from "@/lib/api-client";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { PasswordInput } from "@/components/ui/inputs";
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
      const res = await api<{ needsEmail?: boolean }>(path, { body });
      // Older accounts without an email: ask for one first (it is how they recover a forgotten password).
      router.replace(res?.needsEmail ? `/account/email?next=${encodeURIComponent(next)}` : next);
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { submit, busy, error, errors } = useAuthSubmit("/api/auth/register", next);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (password !== confirmPassword) return setLocalError("The two passwords are not the same.");
        if (!agree) return setLocalError("Please accept the terms to create your account.");
        setLocalError(null);
        submit({ name, email, password, confirmPassword });
      }}
    >
      <Field label="Full name" htmlFor="name" error={errors.name}>
        <Input id="name" autoComplete="name" autoCapitalize="words" placeholder="e.g. Marie Ngono" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email} hint="You sign in with this email. If you forget your password, we send a code to it.">
        <Input id="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="e.g. marie@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Create a password" htmlFor="password" error={errors.password} hint="At least 8 characters.">
        <PasswordInput id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} required />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword ?? (confirmPassword && confirmPassword !== password ? "Not the same as the password." : undefined)}>
        <PasswordInput id="confirmPassword" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} invalid={!!errors.confirmPassword} required />
      </Field>
      <label className="flex items-start gap-2.5 text-sm text-ink-soft">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded accent-brand-600" />
        <span>
          I accept the <Link href="/terms" className="font-medium text-brand-700 underline">terms</Link> and{" "}
          <Link href="/privacy" className="font-medium text-brand-700 underline">privacy policy</Link>.
        </span>
      </label>
      {localError || (error && !Object.keys(errors).length) ? <Alert tone="bad">{localError ?? error}</Alert> : null}
      {error && errors.email?.includes("Sign in") ? (
        <p className="text-sm">
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700 underline">Sign in</Link> or{" "}
          <Link href={`/forgot-password?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700 underline">reset your password</Link>
        </p>
      ) : null}
      <SubmitButton size="lg" className="w-full" loading={busy}>
        Create account
      </SubmitButton>
    </form>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const { submit, busy, error, errors } = useAuthSubmit("/api/auth/login", next);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit({ identifier, password });
      }}
    >
      <Field label="Email" htmlFor="identifier" error={errors.identifier} hint="Account created with a phone number? Type the phone number here.">
        <Input id="identifier" type="text" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="name@gmail.com" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus />
      </Field>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          Password
        </label>
        <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <SubmitButton size="lg" className="w-full" loading={busy}>
        Sign in
      </SubmitButton>
      <Link href={`/forgot-password?next=${encodeURIComponent(next)}`} className="flex h-11 w-full items-center justify-center rounded-md border border-line text-sm font-semibold text-brand-700">
        Forgot password? Get a code by email
      </Link>
    </form>
  );
}

/**
 * Forgot password: a 6-digit code is emailed to the account's email; enter it with a new password.
 * Accounts without an email (very old ones) get the code from Juthelink and enter it here too.
 */
export function ResetPasswordForm({ next, support = "" }: { next: string; support?: string }) {
  const [identifier, setIdentifier] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [noEmail, setNoEmail] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "warn" | "bad"; text: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const { submit, busy, error, errors } = useAuthSubmit("/api/auth/reset", next);
  const digits = support.replace(/\D/g, "");

  async function sendCode() {
    setNote(null);
    setNoEmail(false);
    setSending(true);
    try {
      const r = await api<{ sent: boolean; to?: string; reason?: "not-found" | "no-email" | "unavailable" }>("/api/auth/reset/request", { body: { identifier } });
      if (r.sent) {
        setSentTo(r.to ?? "your email");
        setNote({ tone: "ok", text: `Code sent to ${r.to}. Check your inbox (and the Spam folder). It is valid for 15 minutes.` });
      } else if (r.reason === "no-email") {
        setNoEmail(true);
        setNote({ tone: "warn", text: "This account was created with a phone number and has no email. Message Juthelink: we check it is you and give you a 6-digit code to enter below." });
      } else if (r.reason === "not-found") {
        setNote({ tone: "bad", text: "No account found with that email. Check the spelling, or create a new account." });
      } else {
        setNote({ tone: "warn", text: "We cannot send emails right now. Try again in a few minutes." });
      }
    } catch (err) {
      setNote({ tone: "bad", text: err instanceof ApiError ? err.message : "Could not send the code. Try again." });
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setMismatch(password !== confirmPassword);
        if (password !== confirmPassword) return;
        submit({ identifier, code, password, confirmPassword });
      }}
    >
      <Field label="Email" htmlFor="identifier" error={errors.identifier} hint="Account created with a phone number? Type the phone number.">
        <Input id="identifier" type="text" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="name@gmail.com" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
      </Field>
      <button type="button" onClick={sendCode} disabled={sending || identifier.trim().length < 3} className="inline-flex h-11 w-full items-center justify-center rounded-md bg-brand-600 font-semibold text-white disabled:opacity-50">
        {sending ? "Sending…" : sentTo ? "Send a new code" : "Send me a code"}
      </button>
      {note ? <Alert tone={note.tone}>{note.text}</Alert> : null}
      {noEmail && digits ? (
        <div className="grid grid-cols-2 gap-2">
          <a href={`whatsapp://send?phone=${digits}&text=${encodeURIComponent(`Hello Juthelink, I forgot my account password. My phone number is ${identifier}.`)}`} className="inline-flex h-11 items-center justify-center rounded-md bg-[#25D366] text-sm font-semibold text-white">
            WhatsApp us
          </a>
          <a href={`tel:+${digits}`} className="inline-flex h-11 items-center justify-center rounded-md border border-line text-sm font-semibold text-ink">Call us</a>
        </div>
      ) : null}
      <Field label="6-digit code" htmlFor="code" error={errors.code}>
        <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="font-mono tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
      </Field>
      <Field label="New password" htmlFor="password" error={errors.password} hint="At least 8 characters.">
        <PasswordInput id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword ?? (mismatch || (confirmPassword && confirmPassword !== password) ? "Not the same as the new password." : undefined)}>
        <PasswordInput id="confirmPassword" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} invalid={!!errors.confirmPassword} required />
      </Field>
      {error && !Object.keys(errors).length ? <Alert tone="bad">{error}</Alert> : null}
      <SubmitButton size="lg" className="w-full" loading={busy}>
        Set new password and sign in
      </SubmitButton>
    </form>
  );
}
