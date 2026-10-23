import Link from "next/link";
import { requireStaffPage } from "@/server/admin/guard";
import { can } from "@/server/auth/rbac";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { getNetworkAdapter } from "@/server/network";
import { formatBytes, formatDateTime } from "@/lib/format";
import { Alert, Badge, Card, CardHeader, Empty, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ActionButton } from "@/components/admin/admin-context";
import { ProfileEditButton, ProfileForm } from "@/components/admin/forms";

export default async function NetworkPage() {
  const { staff } = await requireStaffPage("network:view");
  const manage = can(staff.role, "network:manage");
  const adapter = getNetworkAdapter();
  const e = env();
  const [status, profiles, sessions, jobs, failed] = await Promise.all([
    db.integrationStatus.findUnique({ where: { key: "network" } }),
    db.networkProfile.findMany({ orderBy: { routerName: "asc" }, include: { _count: { select: { packages: true } } } }),
    db.networkSession.findMany({ where: { endedAt: null }, orderBy: { startedAt: "desc" }, take: 100, include: { credential: { select: { customerId: true, status: true } } } }),
    db.job.findMany({ where: { status: { in: ["FAILED", "DEAD"] } }, orderBy: { updatedAt: "desc" }, take: 50 }),
    db.accessCredential.count({ where: { provisionState: "FAILED" } }),
  ]);
  return (
    <>
      <PageHeader title="Network" description="MikroTik HotSpot integration. Only a fixed set of safe actions is available here; router configuration is never changed from the browser." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Router connection" />
          <dl className="grid grid-cols-2 gap-y-2 px-4 py-3 text-sm">
            <dt className="text-muted">Adapter</dt>
            <dd>{adapter.kind} {adapter.simulated ? <Badge tone="warn">simulated</Badge> : null}</dd>
            {adapter.kind === "routeros" ? (
              <>
                <dt className="text-muted">Address</dt>
                <dd className="font-mono text-xs">{e.ROUTER_HOST}:{e.ROUTER_PORT} {e.ROUTER_TLS ? "(api-ssl)" : "(plain API)"}</dd>
                <dt className="text-muted">HotSpot server</dt>
                <dd>{e.ROUTER_HOTSPOT_SERVER}</dd>
              </>
            ) : null}
            <dt className="text-muted">Status</dt>
            <dd>{status ? <Badge tone={status.ok ? "ok" : "bad"}>{status.ok ? "reachable" : "unreachable"}</Badge> : "not checked"}</dd>
            <dt className="text-muted">Last check</dt>
            <dd>{status ? formatDateTime(status.checkedAt) : "—"}</dd>
          </dl>
          {status?.error ? <p className="px-4 pb-3 text-xs text-bad">{status.error}</p> : null}
          {adapter.kind === "routeros" && !e.ROUTER_TLS ? (
            <div className="px-4 pb-3"><Alert tone="warn">Plain API (8728) sends the password unencrypted. Use api-ssl (8729) or keep it inside the VPN only.</Alert></div>
          ) : null}
          <p className="px-4 pb-3 text-xs text-muted">Connection settings come from server environment variables, never from this page.</p>
        </Card>
        <Card>
          <CardHeader title="Actions" />
          <div className="flex flex-wrap gap-2 p-4">
            <ActionButton path="/api/admin/network/action" body={{ action: "health" }} label="Check health" showResult />
            <ActionButton path="/api/admin/network/action" body={{ action: "validate" }} label="Validate configuration" showResult />
            {manage ? (
              <>
                <ActionButton path="/api/admin/network/action" body={{ action: "sync-sessions" }} label="Refresh sessions" showResult />
                <ActionButton path="/api/admin/network/action" body={{ action: "sync-profiles" }} label="Push profiles" confirm="Create/update these hotspot user profiles on the router?" showResult />
                <ActionButton path="/api/admin/network/action" body={{ action: "reconcile" }} label="Reconcile users" confirm="Add missing paid users and remove expired users on the router?" showResult />
              </>
            ) : null}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title={`Online now (${sessions.length})`} description="From the last router poll." />
        {sessions.length === 0 ? <Empty>No active sessions.</Empty> : (
          <Table>
            <thead><tr><Th>User</Th><Th>Device</Th><Th>Since</Th><Th>Traffic</Th><Th /></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <Td>
                    {s.credential ? <Link className="text-brand-700 hover:underline" href={`/admin/customers/${s.credential.customerId}`}>customer</Link> : <span className="text-muted">not managed</span>}
                    {s.credential && s.credential.status !== "ACTIVE" ? <Badge tone="bad">{s.credential.status.toLowerCase()}</Badge> : null}
                  </Td>
                  <Td className="font-mono text-xs">{s.macAddress} {s.ipAddress}</Td>
                  <Td>{formatDateTime(s.startedAt)}</Td>
                  <Td>{formatBytes(s.bytesIn + s.bytesOut)}</Td>
                  <Td>{can(staff.role, "customers:revoke") ? <ActionButton path={`/api/admin/network/sessions/${s.id}/disconnect`} label="Disconnect" confirm="Disconnect this device? Its pass stays valid." /> : null}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="User profiles (speed, devices, timeouts)"
          description="Each maps to a RouterOS /ip hotspot user profile. After changes, press “Push profiles”. A long keepalive (3h) stops one ticket being passed from phone to phone."
        />
        {manage ? <div className="border-b border-line p-4"><ProfileForm /></div> : null}
        {profiles.length === 0 ? <Empty>No profiles. Packages use the router&apos;s default profile.</Empty> : (
          <Table>
            <thead><tr><Th>Name</Th><Th>Speed (up/down)</Th><Th>Devices</Th><Th>Idle / keepalive</Th><Th>Packages</Th><Th>Last pushed</Th><Th /></tr></thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <Td className="font-mono">{p.routerName}</Td>
                  <Td>{p.rateLimit ?? "unlimited"}</Td>
                  <Td>{p.sharedUsers}</Td>
                  <Td>{p.idleTimeout ?? "none"} / {p.keepaliveTimeout ?? "2m"}</Td>
                  <Td>{p._count.packages}</Td>
                  <Td>{p.lastSyncedAt ? formatDateTime(p.lastSyncedAt) : "never"}{p.lastSyncError ? <div className="text-xs text-bad">{p.lastSyncError}</div> : null}</Td>
                  <Td>
                    {manage ? (
                      <span className="flex flex-wrap gap-2">
                        <ProfileEditButton
                          value={{
                            id: p.id,
                            routerName: p.routerName,
                            description: p.description,
                            rateLimit: p.rateLimit ?? "",
                            sharedUsers: p.sharedUsers,
                            idleTimeout: p.idleTimeout ?? "none",
                            keepaliveTimeout: p.keepaliveTimeout ?? "3h",
                            statusAutorefresh: p.statusAutorefresh ?? "1m",
                          }}
                        />
                        {p._count.packages === 0 ? <ActionButton method="DELETE" path={`/api/admin/profiles/${p.id}`} label="Delete" confirm="Delete this profile mapping?" /> : null}
                      </span>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader title="Sync errors" description={`${failed} code(s) waiting to be pushed to the router. Jobs retry automatically with backoff.`} />
        {jobs.length === 0 ? <Empty>No failing jobs.</Empty> : (
          <Table>
            <thead><tr><Th>Job</Th><Th>Status</Th><Th>Attempts</Th><Th>Error</Th><Th>Next run</Th><Th /></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <Td className="font-mono text-xs">{j.type}</Td>
                  <Td><Badge tone={j.status === "DEAD" ? "bad" : "warn"}>{j.status.toLowerCase()}</Badge></Td>
                  <Td>{j.attempts}/{j.maxAttempts}</Td>
                  <Td className="max-w-xs text-xs">{j.lastError}</Td>
                  <Td>{j.status === "DEAD" ? "—" : formatDateTime(j.runAt)}</Td>
                  <Td>{manage ? <ActionButton path={`/api/admin/jobs/${j.id}/retry`} label="Retry now" /> : null}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
