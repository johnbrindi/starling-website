import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/server/admin/guard";
import { can } from "@/server/auth/rbac";
import { db } from "@/server/db";
import { isEntitled } from "@/server/subscriptions/service";
import { formatBytes, formatDateTime, formatXaf, maskCode } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { Badge, Card, CardHeader, Empty, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ActionButton } from "@/components/admin/admin-context";

const payTone = { SUCCEEDED: "ok", PENDING: "warn", FAILED: "bad", CANCELLED: "neutral", EXPIRED: "neutral", REFUNDED: "neutral" } as const;

export default async function CustomerPage(props: PageProps<"/admin/customers/[id]">) {
  const { staff } = await requireStaffPage("customers:view");
  const { id } = await props.params;
  const c = await db.customer.findUnique({
    where: { id },
    include: {
      payments: { orderBy: { createdAt: "desc" }, take: 30, include: { package: { select: { name: true } } } },
      subscriptions: { orderBy: { startsAt: "desc" }, take: 30, include: { package: { select: { name: true } } } },
      credentials: { orderBy: { createdAt: "desc" }, take: 10, include: { sessions: { orderBy: { startedAt: "desc" }, take: 10 } } },
    },
  });
  if (!c) notFound();
  const canRevoke = can(staff.role, "customers:revoke");
  const canNet = can(staff.role, "network:manage");
  return (
    <>
      <Link href="/admin/customers" className="text-sm text-muted hover:text-ink">← Customers</Link>
      <PageHeader
        title={formatPhone(c.phone)}
        description={`${c.name ?? "No name"} · customer since ${formatDateTime(c.createdAt)} · ${c.passwordHash ? "account with password" : "no password set"}${c.lockedUntil && c.lockedUntil > new Date() ? " · LOCKED (too many attempts)" : ""}${c.notificationConsent ? " · push reminders on" : ""}`}
        action={
          canRevoke ? (
            <span className="flex flex-wrap items-start gap-2">
            <ActionButton
              path={`/api/admin/customers/${c.id}/reset-code`}
              label="Password reset code"
              confirm="Only give this code to the account owner (verify their identity first). Continue?"
              showResult
            />
            <ActionButton
              path={`/api/admin/customers/${c.id}/block`}
              body={{ blocked: !c.isBlocked }}
              askReason={c.isBlocked ? "Reason for unblocking" : "Reason for blocking (this also revokes active access)"}
              label={c.isBlocked ? "Unblock customer" : "Block customer"}
              variant={c.isBlocked ? "secondary" : "danger"}
            />
            </span>
          ) : null
        }
      />
      <Card className="mb-6">
        <CardHeader title="Access codes" description="Codes are masked. Customers see their own code after signing in." />
        {c.credentials.length === 0 ? (
          <Empty>No codes issued.</Empty>
        ) : (
          <div className="divide-y divide-line">
            {c.credentials.map((cr) => (
              <div key={cr.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{maskCode(cr.username)}</span>
                  <Badge tone={cr.pausedAt ? "warn" : isEntitled(cr) ? "ok" : cr.status === "REVOKED" ? "bad" : "neutral"}>{cr.pausedAt ? "paused" : isEntitled(cr) ? "entitled" : cr.status.toLowerCase()}</Badge>
                  <Badge tone={cr.provisionState === "PROVISIONED" ? "ok" : cr.provisionState === "FAILED" ? "bad" : "neutral"}>router: {cr.provisionState.toLowerCase().replace("_", " ")}</Badge>
                  <span className="text-muted">
                    {formatDateTime(cr.validFrom)} → {formatDateTime(cr.validUntil)} · {cr.maxDevices} device(s) · used {formatBytes(cr.bytesIn + cr.bytesOut)}
                  </span>
                  <span className="ml-auto flex gap-2">
                    <a href={`/admin/receipt/${cr.id}?print=1`} className="inline-flex h-8 items-center rounded-md border border-line px-3 text-sm text-ink hover:bg-surface">Receipt</a>
                    {canRevoke && cr.status === "ACTIVE" && !cr.pausedAt ? <ActionButton path={`/api/admin/credentials/${cr.id}/pause`} label="Pause" confirm="Pause this login? Remaining time is kept." /> : null}
                    {canRevoke && cr.pausedAt ? <ActionButton path={`/api/admin/credentials/${cr.id}/resume`} label="Resume" variant="primary" /> : null}
                    {canNet ? <ActionButton path={`/api/admin/credentials/${cr.id}/resync`} label="Re-sync router" /> : null}
                    {canRevoke && cr.status === "ACTIVE" ? (
                      <ActionButton path={`/api/admin/credentials/${cr.id}/revoke`} askReason="Reason for revoking this access" label="Revoke" variant="danger" />
                    ) : null}
                  </span>
                </div>
                {cr.lastSyncError ? <p className="mt-1 text-xs text-bad">Router: {cr.lastSyncError}</p> : null}
                {cr.sessions.length ? (
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {cr.sessions.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-2">
                        <span className="font-mono">{s.macAddress ?? "?"}</span> {s.ipAddress} · {formatDateTime(s.startedAt)}
                        {s.endedAt ? ` → ${formatDateTime(s.endedAt)} (${s.endReason})` : <Badge tone="ok">online</Badge>}
                        {!s.endedAt && canRevoke ? <ActionButton path={`/api/admin/network/sessions/${s.id}/disconnect`} label="Disconnect" confirm="Disconnect this device? Its pass stays valid." /> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Payments" />
          {c.payments.length === 0 ? <Empty>No payments.</Empty> : (
            <Table>
              <thead><tr><Th>Date</Th><Th>Pass</Th><Th>Amount</Th><Th>Status</Th></tr></thead>
              <tbody>
                {c.payments.map((p) => (
                  <tr key={p.id}>
                    <Td>{formatDateTime(p.createdAt)}<div className="font-mono text-xs text-muted">{p.reference}</div></Td>
                    <Td>{p.package.name}</Td>
                    <Td>{formatXaf(p.amountXaf)}{p.isSimulated ? <div><Badge tone="warn">simulated</Badge></div> : null}</Td>
                    <Td><Badge tone={payTone[p.status]}>{p.status.toLowerCase()}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Subscription periods" />
          {c.subscriptions.length === 0 ? <Empty>No passes.</Empty> : (
            <Table>
              <thead><tr><Th>Pass</Th><Th>Period</Th><Th>Source</Th><Th>Status</Th></tr></thead>
              <tbody>
                {c.subscriptions.map((s) => (
                  <tr key={s.id}>
                    <Td>{s.package.name}</Td>
                    <Td>{formatDateTime(s.startsAt)} → {formatDateTime(s.endsAt)}</Td>
                    <Td>{s.voucherId ? "voucher" : "payment"}</Td>
                    <Td><Badge tone={s.status === "ACTIVE" ? "ok" : s.status === "REVOKED" ? "bad" : "neutral"}>{s.status.toLowerCase()}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
