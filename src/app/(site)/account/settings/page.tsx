import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCustomer } from "@/server/auth/session";
import { formatPhone } from "@/lib/phone";
import { formatDateTime } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/primitives";
import { ChangePasswordForm, ProfileForm, SignOutButton } from "@/components/customer/forms";

export const metadata: Metadata = { title: "Account settings" };

export default async function AccountSettingsPage() {
  const ctx = await getCustomer();
  if (!ctx) redirect("/login?next=/account/settings");
  const c = ctx.customer;
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Link href="/account" className="text-sm text-muted hover:text-ink">← My Wi-Fi</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Account settings</h1>
      <Card className="rounded-xl">
        <CardHeader title="Profile" description={`Phone ${formatPhone(c.phone)} · member since ${formatDateTime(c.createdAt)}`} />
        <div className="p-4 sm:p-5">
          <ProfileForm initialName={c.name ?? ""} />
        </div>
      </Card>
      {c.passwordHash ? (
        <Card className="rounded-xl">
          <CardHeader title="Password" />
          <div className="p-4 sm:p-5">
            <ChangePasswordForm />
          </div>
        </Card>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SignOutButton />
        <p className="text-xs text-muted">
          Signing out does not end your Wi-Fi time. <Link href="/terms" className="underline">Terms</Link> ·{" "}
          <Link href="/privacy" className="underline">Privacy</Link>
        </p>
      </div>
    </div>
  );
}
