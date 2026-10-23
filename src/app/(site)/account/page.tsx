import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCustomer } from "@/server/auth/session";
import { getAccessStatus } from "@/server/subscriptions/status";
import { provisionNow } from "@/server/jobs/tick";
import { getNetworkAdapter } from "@/server/network";
import { getSettings } from "@/server/settings";
import { db } from "@/server/db";
import { formatPhone } from "@/lib/phone";
import { formatDateTime } from "@/lib/format";
import { AccessPanel } from "@/components/customer/access-panel";
import { HowToUse } from "@/components/customer/how-to-use";
import { PurchaseSteps } from "@/components/customer/steps";
import { Alert, Card, CardHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "My Wi-Fi" };

const LINKS = [
  { href: "/plans", title: "Buy a pass", text: "From 100 FCFA" },
  { href: "/redeem", title: "Voucher card", text: "Redeem a printed card" },
  { href: "/account/history", title: "History", text: "Payments and passes" },
  { href: "/account/settings", title: "Account", text: "Name and password" },
];

export default async function AccountPage(props: PageProps<"/account">) {
  const sp = await props.searchParams;
  const ctx = await getCustomer();
  if (!ctx) redirect("/login?next=/account");
  let status = await getAccessStatus(ctx.customer.id);
  if (status.state === "PROVISIONING") {
    // Push a waiting code to the router now rather than waiting for the worker (failures are retried).
    await provisionNow(ctx.customer.id);
    status = await getAccessStatus(ctx.customer.id);
  }
  const [notices, settings] = await Promise.all([
    db.notification.findMany({ where: { customerId: ctx.customer.id, channel: "IN_APP" }, orderBy: { createdAt: "desc" }, take: 5 }),
    getSettings(),
  ]);
  const firstName = ctx.customer.name?.split(" ")[0];
  const hasLiveCode = !!status.credential && ["READY", "ONLINE", "PROVISIONING"].includes(status.state);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {sp.paid || sp.redeemed ? <PurchaseSteps current={4} /> : null}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{firstName ? `Hi, ${firstName}` : "My Wi-Fi"}</h1>
        <p className="mt-1 text-sm text-muted">{formatPhone(ctx.customer.phone)}</p>
      </div>
      {sp.paid ? <Alert tone="ok" title="Payment confirmed">Your access code is ready. Tap “Connect this device” to go online.</Alert> : null}
      {sp.redeemed ? <Alert tone="ok" title="Voucher redeemed">Your access code is ready. Tap “Connect this device” to go online.</Alert> : null}
      {!ctx.customer.passwordHash ? (
        <Alert tone="warn" title="Protect your account">
          Set a password so you can sign in on any device. <Link href="/forgot-password" className="font-semibold underline">Set password</Link>
        </Alert>
      ) : null}

      <AccessPanel initial={status} networkSimulated={getNetworkAdapter().simulated} />

      {hasLiveCode ? <HowToUse username={status.credential!.username} password={status.credential!.password} maxDevices={status.credential!.maxDevices} networkName={settings.businessName} /> : null}

      <div className="grid grid-cols-2 gap-3">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-xl border border-line bg-white px-4 py-3 hover:border-brand-500">
            <p className="text-sm font-semibold text-ink">{l.title}</p>
            <p className="text-xs text-muted">{l.text}</p>
          </Link>
        ))}
      </div>

      {notices.length ? (
        <Card className="rounded-xl">
          <CardHeader title="Recent notices" />
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
    </div>
  );
}
