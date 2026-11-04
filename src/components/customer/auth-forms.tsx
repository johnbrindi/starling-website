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
  const [email, setEmail] = useState("");
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
        submit({ name, phone, email, password });
      }}
    >
      <Field label="Full name" htmlFor="name" error={errors.name}>
        <Input id="name" autoComplete="name" autoCapitalize="words" placeholder="e.g. Marie Ngono" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Phone number" htmlFor="phone" error={errors.phone} hint="You will sign in with this number.">
        <PhoneInput id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!errors.phone} required />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email} hint="Only used to send you a code if you forget your password.">
        <Input id="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="e.g. marie@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
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

type ResetWay = "email" | "wifi" | "support";

/**
 * Forgot password, three ways: a code by email, the username + password of a Wi-Fi login the
 * customer bought, or a 6-digit code from Juthelink support (WhatsApp).
 */
export function ResetPasswordForm({ next, support = "" }: { next: string; support?: string }) {
  const [way, setWay] = useState<ResetWay>("email");
  const [identifier, setIdentifier] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "warn" | "bad"; text: string } | null>(null);
  const [code, setCode] = useState("");
  const [wifiUsername, setWifiUsername] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [password, setPassword] = useState("");
  const { submit, busy, error, errors } = useAuthSubmit("/api/auth/reset", next);
  const digits = support.replace(/\D/g, "");

  async function sendCode() {
    setNote(null);
    setSending(true);
    try {
      const r = await api<{ sent: boolean; to?: string; reason?: "not-found" | "no-email" | "unavailable" }>("/api/auth/reset/request", { body: { identifier } });
      if (r.sent) {
        setSentTo(r.to ?? "your email");
        setNote({ tone: "ok", text: `We sent a 6-digit code to ${r.to}. Check your inbox and spam folder. It is valid for 15 minutes.` });
      } else if (r.reason === "no-email") {
        setNote({ tone: "warn", text: "This account has no email yet. Use your Wi-Fi login below, or ask Juthelink for a code." });
        setWay("wifi");
      } else if (r.reason === "not-found") {
        setNote({ tone: "bad", text: "No account found for that phone number or email. Check it, or create a new account." });
      } else {
        setNote({ tone: "warn", text: "Email is not available right now. Use your Wi-Fi login, or ask Juthelink for a code." });
      }
    } catch (err) {
      setNote({ tone: "bad", text: err instanceof ApiError ? err.message : "Could not send the code. Try again." });
    } finally {
      setSending(false);
    }
  }

  const tab = (w: ResetWay, label: string) => (
    <button
      type="button"
      onClick={() => setWay(w)}
      className={`h-10 flex-1 rounded-md text-sm font-medium ${way === w ? "bg-brand-600 text-white" : "border border-line text-ink-soft hover:bg-surface"}`}
    >
      {label}
    </button>
  );
  const identifierField = (
    <Field label="Phone number or email" htmlFor="identifier" error={errors.identifier}>
      <Input id="identifier" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="6 70 00 00 00 or name@gmail.com" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
    </Field>
  );
  const newPassword = (
    <Field label="New password" htmlFor="password" error={errors.password} hint="At least 8 characters.">
      <PasswordInput id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!errors.password} required />
    </Field>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {tab("email", "By email")}
        {tab("wifi", "Wi-Fi login")}
        {tab("support", "Ask us")}
      </div>
      {note ? <Alert tone={note.tone}>{note.text}</Alert> : null}

      {way === "support" ? (
        <div className="space-y-3 text-sm text-ink-soft">
          <p>Message Juthelink with your phone number. We check it is you and send you a 6-digit code. Then come back to <b>By email</b> → “I already have a code”.</p>
          {digits ? (
            <div className="grid grid-cols-2 gap-2">
              <a href={`whatsapp://send?phone=${digits}&text=${encodeURIComponent(`Hello Juthelink, I forgot my account password. My phone number is ${identifier || "…"}.`)}`} className="col-span-2 inline-flex h-11 items-center justify-center rounded-md bg-[#25D366] font-semibold text-white">
                WhatsApp Juthelink
              </a>
              <a href={`tel:+${digits}`} className="inline-flex h-10 items-center justify-center rounded-md border border-line font-medium text-ink">Call us</a>
              <button type="button" onClick={() => setWay("email")} className="inline-flex h-10 items-center justify-center rounded-md border border-line font-medium text-ink">I have a code</button>
            </div>
          ) : null}
        </div>
      ) : (
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (way === "email") submit({ method: "code", identifier, code, password });
            else submit({ method: "wifi", identifier, wifiUsername, wifiPassword, password });
          }}
        >
          {identifierField}
          {way === "email" ? (
            <>
              <button type="button" onClick={sendCode} disabled={sending || identifier.trim().length < 3} className="inline-flex h-11 w-full items-center justify-center rounded-md border border-brand-600 font-semibold text-brand-700 disabled:opacity-50">
                {sending ? "Sending…" : sentTo ? "Send a new code" : "Send me a code by email"}
              </button>
              <Field label="6-digit code" htmlFor="code" error={errors.code} hint="From the email, or from Juthelink support.">
                <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="font-mono tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
              </Field>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-soft">Use any Wi-Fi login you bought with this account (on your receipt, in the SMS/page you got, or still saved in your phone).</p>
              <Field label="Wi-Fi username" htmlFor="wu" error={errors.wifiUsername}>
                <Input id="wu" autoCapitalize="none" spellCheck={false} className="font-mono" value={wifiUsername} onChange={(e) => setWifiUsername(e.target.value)} required />
              </Field>
              <Field label="Wi-Fi password" htmlFor="wp" error={errors.wifiPassword}>
                <Input id="wp" inputMode="numeric" autoCapitalize="none" className="font-mono" value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} required />
              </Field>
            </>
          )}
          {newPassword}
          {error && !Object.keys(errors).length ? <Alert tone="bad">{error}</Alert> : null}
          <SubmitButton size="lg" className="w-full" loading={busy}>
            Set new password and sign in
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
