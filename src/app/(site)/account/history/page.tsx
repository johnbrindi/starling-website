import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCustomer } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatDateTime, formatXaf } from "@/lib/format";
import { Badge, Card, CardHeader, Empty, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Purchase history" };

const tone = { SUCCEEDED: "ok", PENDING: "warn", FAILED: "bad", CANCELLED: "neutral", EXPIRED: "neutral", REFUNDED: "neutral" } as const;

export default async function HistoryPage() {
  const ctx = await getCustomer();
  if (!ctx) redirect("/account");
  const [payments, subs] = await Promise.all([
    db.payment.findMany({ where: { customerId: ctx.customer.id }, include: { package: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.subscription.findMany({ where: { customerId: ctx.customer.id, voucherId: { not: null } }, include: { package: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Purchase history" action={<Link href="/account" className="text-sm font-medium text-brand-700 hover:underline">← My access</Link>} />
      <Card>
        <CardHeader title="Mobile Money payments" />
        {payments.length === 0 ? (
          <Empty>No payments yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                <div>
                  <p className="font-medium text-ink">
                    {p.package.name} · {formatXaf(p.amountXaf)}
                  </p>
                  <p className="text-xs text-muted" suppressHydrationWarning>
                    {formatDateTime(p.createdAt)} · {p.reference}
                    {p.isSimulated ? " · simulated" : ""}
                  </p>
                </div>
                <Badge tone={tone[p.status]}>{p.status.toLowerCase()}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {subs.length ? (
        <Card>
          <CardHeader title="Voucher cards" />
          <ul className="divide-y divide-line">
            {subs.map((s) => (
              <li key={s.id} className="px-4 py-3 text-sm sm:px-5" suppressHydrationWarning>
                {s.package.name} · redeemed {formatDateTime(s.createdAt)}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
