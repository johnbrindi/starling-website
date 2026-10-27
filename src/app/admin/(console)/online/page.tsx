import Link from "next/link";
import { requireStaffPage } from "@/server/admin/guard";
import { can } from "@/server/auth/rbac";
import { db } from "@/server/db";
import { SPEED_TIERS, isSpeedTier } from "@/server/network/commands";
import { formatBytes, formatDateTime, formatRemaining } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { Alert, Badge, Card, Empty, PageHeader } from "@/components/ui/primitives";
import { ActionButton } from "@/components/admin/admin-context";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { LimitsForm } from "@/components/admin/limits-form";

function since(minutes: number) {
  return new Date(Date.now() - minutes * 60_000);
}
function nowMs() {
  return Date.now();
}
function uptime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

const TIERS = Object.entries(SPEED_TIERS).map(([key, t]) => ({ key, label: t.label }));

/** Devices online now (reported by the router every ~30 s), paused logins and blocked devices. */
export default async function OnlinePage() {
  const { staff } = await requireStaffPage("customers:view");
  const canAct = can(staff.role, "customers:revoke");
  const [sessions, paused, blocked, report, pendingCmds] = await Promise.all([
    db.networkSession.findMany({
      where: { endedAt: null, lastSeenAt: { gt: since(3) } },
      include: {
        credential: {
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            subscriptions: { orderBy: { createdAt: "desc" }, take: 1, select: { package: { select: { name: true } } } },
          },
        },
      },
      orderBy: { startedAt: "desc" },
      take: 200,
    }),
    db.accessCredential.findMany({ where: { pausedAt: { not: null }, status: "ACTIVE" }, include: { customer: { select: { name: true, phone: true } } }, take: 100 }),
    db.deviceBlock.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    db.integrationStatus.findUnique({ where: { key: "router-report" } }),
    db.networkCommand.count({ where: { doneAt: null, createdAt: { gt: since(24 * 60) } } }),
  ]);
  const now = nowMs();
  const stale = !report || now - report.checkedAt.getTime() > 2 * 60_000;
  const blockedMacs = new Set(blocked.map((b) => b.macAddress));

  return (
    <>
      <AutoRefresh seconds={15} />
      <PageHeader title={`Online now (${sessions.length})`} description="Devices logged in to the Wi-Fi, reported by the router every 30 seconds. Actions reach the router within about 10 seconds." />
      {stale ? (
        <div className="mb-4">
          <Alert tone="warn" title="The router has not reported recently">
            {report ? `Last report ${formatDateTime(report.checkedAt)}.` : "No report yet."} Import the latest juthelink-sync.rsc on the router (it adds the report), and check the router has internet.
          </Alert>
        </div>
      ) : null}
      {pendingCmds > 0 ? <p className="mb-3 text-xs text-muted">{pendingCmds} action(s) waiting for the router to confirm.</p> : null}

      {sessions.length === 0 ? (
        <Card><Empty>No device is online right now.</Empty></Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const c = s.credential;
            const left = c ? c.validUntil.getTime() - now : null;
            return (
              <Card key={s.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-lg font-semibold">{s.username}</p>
                    <p className="text-sm text-ink-soft">
                      {c?.customer ? (
                        <Link href={`/admin/customers/${c.customer.id}`} className="text-brand-700 hover:underline">{c.customer.name ?? formatPhone(c.customer.phone)}</Link>
                      ) : c ? "Ticket / counter sale" : "Router-only login (family or ticket maker)"}
                      {c?.subscriptions[0] ? ` · ${c.subscriptions[0].package.name}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Device {s.macAddress ?? "?"} · {s.ipAddress ?? "?"} · online {uptime(s.uptimeSeconds)} · used {formatBytes(s.bytesIn + s.bytesOut)}
                    </p>
                    {c ? (
                      <p className="text-xs text-muted">
                        {left !== null && left > 0 ? `${formatRemaining(left)} left` : "expired"} · ends {formatDateTime(c.validUntil)} · speed {isSpeedTier(c.rateLimit) ? SPEED_TIERS[c.rateLimit].label : "plan default"}
                        {c.dataLimitBytes ? ` · limit ${formatBytes(c.dataLimitBytes)}` : ""}
                      </p>
                    ) : null}
                  </div>
                  {s.macAddress && blockedMacs.has(s.macAddress) ? <Badge tone="bad">blocked</Badge> : <Badge tone="ok">online</Badge>}
                </div>
                {canAct ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton path="/api/admin/devices/disconnect" body={{ username: s.username }} label="Disconnect" confirm={`Disconnect ${s.username}? They must log in again.`} />
                    {c && c.status === "ACTIVE" ? <ActionButton path={`/api/admin/credentials/${c.id}/pause`} label="Pause" confirm={`Pause ${s.username}? Their remaining time is kept.`} /> : null}
                    {s.macAddress ? <ActionButton path="/api/admin/devices/block" body={{ mac: s.macAddress }} label="Block device" variant="danger" askReason="Why block this device? (e.g. sharing, abuse)" /> : null}
                    {c && c.status === "ACTIVE" ? <ActionButton path={`/api/admin/credentials/${c.id}/revoke`} label="Revoke login" variant="danger" askReason="Reason for revoking this login?" /> : null}
                    {c ? <Link href={`/admin/receipt/${c.id}?print=1`} className="inline-flex h-8 items-center rounded-md border border-line px-3 text-sm text-ink hover:bg-surface">Receipt</Link> : null}
                  </div>
                ) : null}
                {canAct && c && c.status === "ACTIVE" ? (
                  <div className="mt-3 border-t border-line pt-3">
                    <LimitsForm credentialId={c.id} speed={isSpeedTier(c.rateLimit) ? c.rateLimit : null} dataLimitMb={c.dataLimitBytes ? Number(c.dataLimitBytes / 1048576n) : null} tiers={TIERS} />
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="mt-8 mb-2 text-sm font-semibold text-ink-soft">Paused logins ({paused.length})</h2>
      <Card>
        {paused.length === 0 ? <Empty>No paused login.</Empty> : (
          <ul className="divide-y divide-line text-sm">
            {paused.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span><span className="font-mono">{c.username}</span> · {c.customer ? (c.customer.name ?? formatPhone(c.customer.phone)) : "ticket"} · paused {formatDateTime(c.pausedAt!)} · {formatRemaining(Math.max(0, c.validUntil.getTime() - c.pausedAt!.getTime()))} kept</span>
                {canAct ? <ActionButton path={`/api/admin/credentials/${c.id}/resume`} label="Resume" variant="primary" /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h2 className="mt-8 mb-2 text-sm font-semibold text-ink-soft">Blocked devices ({blocked.length})</h2>
      <Card>
        {blocked.length === 0 ? <Empty>No blocked device.</Empty> : (
          <ul className="divide-y divide-line text-sm">
            {blocked.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span><span className="font-mono">{b.macAddress}</span>{b.note ? ` · ${b.note}` : ""} · since {formatDateTime(b.createdAt)}</span>
                {canAct ? <ActionButton path="/api/admin/devices/unblock" body={{ mac: b.macAddress }} label="Unblock" confirm={`Allow ${b.macAddress} again?`} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
