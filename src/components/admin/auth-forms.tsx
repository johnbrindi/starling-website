"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export function StaffLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/admin/auth/login", { body: { email, password } });
          router.replace("/admin");
          router.refresh();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Sign-in failed.");
          setBusy(false);
        }
      }}
    >
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <Button type="submit" className="w-full" loading={busy}>
        Sign in
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) return <Alert tone="ok" title="Password changed">You can now <a className="underline" href="/admin/login">sign in</a>.</Alert>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/admin/auth/reset", { body: { token, password } });
          setDone(true);
        } catch (err) {
          setError(err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : "Reset failed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="New password" htmlFor="pw" hint="At least 12 characters, with letters and numbers.">
        <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      {error ? <Alert tone="bad">{error}</Alert> : null}
      <Button type="submit" className="w-full" loading={busy}>
        Set password
      </Button>
    </form>
  );
}

export function StaffSignOut() {
  const router = useRouter();
  return (
    <button
      className="text-sm text-muted hover:text-ink"
      onClick={async () => {
        await api("/api/admin/auth/logout", { body: {} }).catch(() => undefined);
        router.replace("/admin/login");
      }}
    >
      Sign out
    </button>
  );
}
