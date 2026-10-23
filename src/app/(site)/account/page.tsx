import type { Metadata } from "next";
import Link from "next/link";
import { getCustomer } from "@/server/auth/session";
import { getAccessStatus } from "@/server/subscriptions/status";
import { getNetworkAdapter } from "@/server/network";
import { db } from "@/server/db";
import { formatPhone } from "@/lib/phone";
import { formatDateTime } from "@/lib/format";
import { AccessPanel } from "@/components/customer/access-panel";
import { RecoverForm, SignOutButton, VoucherForm } from "@/components/customer/forms";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "My access" };

export default async function AccountPage(props: PageProps<"/account">) {
  const sp = await props.searchParams;
  const ctx = await getCustomer();
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="My access" description="Sign in with the number you paid with to see your code and remaining time." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader title="Already paid?" description="Use your phone number and access code." />
            <div className="p-4 sm:p-5">
              <RecoverForm />
            </div>
          </Card>
          <Card>
            <CardHeader title="Have a voucher card?" description="Bought a printed card at the counter." />
            <div className="p-4 sm:p-5">
              <VoucherForm />
            </div>
          </Card>
        </div>
        <p className="mt-6 text-sm text-muted">
          New here? <Link href="/plans" className="font-medium text-brand-700 hover:underline">Buy a pass</Link>. You are signed in automatically after paying.
        </p>
      </div>
    );
  }
  const [status, notices] = await Promise.all([
    getAccessStatus(ctx.customer.id),
    db.notification.findMany({ where: { customerId: ctx.customer.id, channel: "IN_APP" }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="My access"
        description={`Signed in as ${formatPhone(ctx.customer.phone)}`}
        action={
          <Link href="/account/history" className="text-sm font-medium text-brand-700 hover:underline">
            Purchase history
          </Link>
        }
      />
      {sp.paid ? <Alert tone="ok" title="Payment confirmed">Your access code is below. Tap Connect to go online.</Alert> : null}
      {sp.redeemed ? <Alert tone="ok" title="Voucher redeemed">Your access code is below.</Alert> : null}
      <AccessPanel initial={status} networkSimulated={getNetworkAdapter().simulated} />
      {notices.length ? (
        <Card>
          <CardHeader title="Notices" />
          <ul className="divide-y divide-line">
            {notices.map((n) => (
              <li key={n.id} className="px-4 py-3 text-sm sm:px-5">
                <p className="font-medium text-ink">{n.title}</p>
                <p className="text-muted">{n.body}</p>
                <p className="mt-0.5 text-xs text-muted" suppressHydrationWarning>
                  {formatDateTime(n.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <SignOutButton />
    </div>
  );
}
