import Link from "next/link";
import { StaffPushToggle } from "@/components/admin/staff-push";
import { can } from "@/server/auth/rbac";
import { requireStaffPage } from "@/server/admin/guard";
import { db } from "@/server/db";
import { getDashboard } from "@/server/admin/dashboard";
import { formatDateTime, formatXaf } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { Alert, Badge, Card, CardHeader, Empty, PageHeader, Stat, Table, Td, Th } from "@/components/ui/primitives";

export default async function DashboardPage(props: PageProps<"/admin">) {
  const { staff } = await requireStaffPage("dashboard:view");
  const sp = await props.searchParams;
  const d = await getDashboard();
  const toConfirm = await db.payment.count({ where: { provider: "MANUAL", status: "PENDING", claimedAt: { not: null } } });
  const netOk = d.network.status?.ok ?? false;
  return (
    <>
      <PageHeader title="Dashboard" description="Live figures from the database. Revenue excludes simulated payments." />
      {can(staff.role, "payments:approve") ? <div className="mb-4"><StaffPushToggle /></div> : null}
      {toConfirm > 0 ? (
        <div className="mb-4">
          <Alert tone="warn" title={`${toConfirm} MoMo payment(s) waiting for you`}>
            <Link href="/admin/confirm" className="font-semibold underline">Open Confirm MoMo</Link> and approve them after checking the MTN SMS.
          </Alert>
        </div>
      ) : null}
      {sp.denied ? <div className="mb-4"><Alert tone="bad">You do not have permission to open that page.</Alert></div> : null}
      {d.deadJobs > 0 || d.provisionFailed > 0 ? (
        <div className="mb-4">
          <Alert tone="warn" title="Attention needed">
            {d.provisionFailed > 0 ? `${d.provisionFailed} paid code(s) not yet on the router (retrying). ` : ""}
            {d.deadJobs > 0 ? `${d.deadJobs} background job(s) gave up. See Network → Sync errors.` : ""}
          </Alert>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <Stat label="Active passes" value={d.activeSubscriptions} sub="entitled right now" />
        <Stat label="Online sessions" value={d.onlineSessions} sub={d.network.simulated ? "simulated router" : "from router"} />
        <Stat label="Revenue today" value={formatXaf(d.revenue.day.amount)} sub={`${d.revenue.day.count} payments, last 24 h`} />
        <Stat label="Revenue 7 days" value={formatXaf(d.revenue.week.amount)} sub={`${d.revenue.week.count} payments`} />
        <Stat label="Customers" value={d.customers} />
        <Stat label="Failed payments" value={d.failedPaymentsDay} sub="last 24 h" />
        <Stat label="All-time revenue" value={formatXaf(d.revenue.all.amount)} sub={`${d.revenue.all.count} payments`} />
        <Stat label="Tickets used, 7 days" value={formatXaf(d.tickets.usedWeek.amount)} sub={`${d.tickets.usedWeek.count} used · ${d.tickets.unused} unused in stock`} />
        <Stat label="Simulated (test)" value={formatXaf(d.revenue.simulated.amount)} sub={`${d.revenue.simulated.count} test payments, not revenue`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Integrations" />
          <dl className="divide-y divide-line text-sm">
            <div className="flex items-center justify-between px-4 py-3">
              <dt>Router ({d.network.mode})</dt>
              <dd className="flex items-center gap-2">
                {d.network.simulated ? <Badge tone="warn">simulated</Badge> : null}
                {d.network.status ? <Badge tone={netOk ? "ok" : "bad"}>{netOk ? "healthy" : "unreachable"}</Badge> : <Badge>not checked yet</Badge>}
              </dd>
            </div>
            {d.network.status?.error ? <p className="px-4 py-2 text-xs text-bad">{d.network.status.error}</p> : null}
            <div className="flex items-center justify-between px-4 py-3">
              <dt>Payments ({d.payments.mode})</dt>
              <dd>{d.payments.simulated ? <Badge tone="warn">simulated</Badge> : <Badge tone="ok">live provider</Badge>}</dd>
            </div>
            {d.network.status ? <p className="px-4 py-2 text-xs text-muted">Last router check {formatDateTime(d.network.status.checkedAt)}</p> : null}
          </dl>
        </Card>
        <Card>
          <CardHeader title="Expiring within an hour" />
          {d.expiringSoon.length === 0 ? (
            <Empty>Nothing expiring soon.</Empty>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {d.expiringSoon.map((c) => (
                <li key={c.id} className="flex justify-between px-4 py-2.5">
                  <span>{c.customer ? formatPhone(c.customer.phone) : `Ticket ${c.username}`}</span>
                  <span className="text-muted">{formatDateTime(c.validUntil)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent events" />
        <Table>
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Action</Th>
              <Th>Actor</Th>
              <Th>Target</Th>
            </tr>
          </thead>
          <tbody>
            {d.recentEvents.map((e) => (
              <tr key={e.id}>
                <Td>{formatDateTime(e.createdAt)}</Td>
                <Td className="font-mono text-xs">{e.action}</Td>
                <Td>{e.actorType.toLowerCase()}</Td>
                <Td className="text-xs">{e.targetType ? `${e.targetType} ${e.targetId?.slice(-6)}` : ""}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
