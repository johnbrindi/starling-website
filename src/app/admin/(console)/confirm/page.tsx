import Link from "next/link";
import { requireStaffPage } from "@/server/admin/guard";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { formatDateTime, formatXaf } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui/primitives";
import { ActionButton } from "@/components/admin/admin-context";
import { AutoRefresh } from "@/components/admin/auto-refresh";

/**
 * Manual MTN MoMo payments waiting for staff. Approve only after the MTN SMS on the business phone
 * shows the same amount (and Transaction ID). Approving creates the login; the router picks it up.
 */
function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3600_000);
}

export default async function ConfirmPaymentsPage() {
  await requireStaffPage("payments:approve");
  const since = hoursAgo(48);
  const [waiting, recent] = await Promise.all([
    db.payment.findMany({
      where: { provider: "MANUAL", status: "PENDING" },
      include: { package: { select: { name: true } }, customer: { select: { name: true } } },
      orderBy: [{ claimedAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 50,
    }),
    db.payment.findMany({
      where: { provider: "MANUAL", status: { in: ["SUCCEEDED", "FAILED", "EXPIRED"] }, updatedAt: { gt: since } },
      include: { package: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);
  const claimed = waiting.filter((p) => p.claimedAt);
  const unclaimed = waiting.filter((p) => !p.claimedAt);
  return (
    <>
      <AutoRefresh seconds={15} />
      <PageHeader
        title={`MoMo payments to confirm${claimed.length ? ` (${claimed.length})` : ""}`}
        description={`Check the MTN SMS on the business phone (${env().MANUAL_MOMO_NUMBER}). Approve only if the amount and Transaction ID match. The page refreshes by itself.`}
      />
      {claimed.length === 0 ? (
        <Card><Empty>Nothing to confirm right now.</Empty></Card>
      ) : (
        <div className="space-y-3">
          {claimed.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xl font-semibold">{formatXaf(p.amountXaf)} <span className="text-base font-normal text-muted">· {p.package.name}</span></p>
                  <p className="mt-1 text-sm">Transaction ID <span className="font-mono text-base font-semibold">{p.providerReference}</span></p>
                  <p className="mt-1 text-sm text-muted">
                    From {formatPhone(p.payerPhone)} · {p.customer.name ?? "customer"} · sent {formatDateTime(p.claimedAt!)}
                  </p>
                </div>
                <Badge tone="warn">waiting</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ActionButton path={`/api/admin/payments/${p.id}/approve`} label="Approve" variant="primary" size="md" confirm={`Approve ${formatXaf(p.amountXaf)} from ${formatPhone(p.payerPhone)}? Only if the MTN SMS shows this payment.`} showResult />
                <ActionButton path={`/api/admin/payments/${p.id}/reject`} label="Reject" variant="danger" size="md" askReason="Why? (e.g. no money received, wrong amount)" showResult />
              </div>
            </Card>
          ))}
        </div>
      )}

      {unclaimed.length ? (
        <div className="mt-6">
          <Alert tone="neutral" title={`${unclaimed.length} customer(s) are paying now`}>
            They have not typed a Transaction ID yet. If the money already arrived (same phone and amount), you can approve here:
            <ul className="mt-2 space-y-2">
              {unclaimed.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{formatXaf(p.amountXaf)} · {p.package.name} · {formatPhone(p.payerPhone)} · {formatDateTime(p.createdAt)}</span>
                  <ActionButton path={`/api/admin/payments/${p.id}/approve`} label="Approve" confirm={`No Transaction ID yet. Approve ${formatXaf(p.amountXaf)} from ${formatPhone(p.payerPhone)} only if the MTN SMS shows it.`} showResult />
                </li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}

      <h2 className="mt-8 mb-2 text-sm font-semibold text-ink-soft">Last 48 hours</h2>
      <Card>
        {recent.length === 0 ? <Empty>No manual payments yet.</Empty> : (
          <ul className="divide-y divide-line text-sm">
            {recent.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span>{formatXaf(p.amountXaf)} · {p.package.name} · {formatPhone(p.payerPhone)} {p.providerReference ? <span className="font-mono text-xs">· {p.providerReference}</span> : null}</span>
                <Badge tone={p.status === "SUCCEEDED" ? "ok" : p.status === "FAILED" ? "bad" : "neutral"}>{p.status === "SUCCEEDED" ? "approved" : p.status === "FAILED" ? "rejected" : "expired"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-4 text-sm text-muted">Customer paid in cash or asked you directly? Use <Link className="text-brand-700 underline" href="/admin/sell">Sell a pass</Link> to make a login on the spot.</p>
    </>
  );
}
