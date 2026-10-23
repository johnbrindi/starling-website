import { requireStaffPage } from "@/server/admin/guard";
import { can } from "@/server/auth/rbac";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { effectivePrice } from "@/server/payments/service";
import { formatDateTime, formatXaf } from "@/lib/format";
import { Badge, Card, CardHeader, Empty, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { ActionButton } from "@/components/admin/admin-context";
import { ReprintButton, TicketGenerator } from "@/components/admin/tickets";

export default async function TicketsPage() {
  const { staff } = await requireStaffPage("sales:create");
  const now = new Date();
  const [packages, settings, rows] = await Promise.all([
    db.package.findMany({ where: { status: { in: ["ACTIVE", "INACTIVE"] } }, orderBy: [{ sortOrder: "asc" }, { priceXaf: "asc" }] }),
    getSettings(),
    db.accessCredential.findMany({
      where: { ticketBatch: { not: null } },
      select: { ticketBatch: true, firstLoginAt: true, status: true, validUntil: true, priceXaf: true, createdAt: true, package: { select: { name: true } } },
    }),
  ]);
  const batches = new Map<string, { pkg: string; created: Date; total: number; unused: number; active: number; finished: number; revoked: number; value: number }>();
  for (const r of rows) {
    const b = batches.get(r.ticketBatch!) ?? { pkg: r.package?.name ?? "—", created: r.createdAt, total: 0, unused: 0, active: 0, finished: 0, revoked: 0, value: 0 };
    b.total++;
    if (r.status === "REVOKED") b.revoked++;
    else if (!r.firstLoginAt && r.validUntil > now) b.unused++;
    else if (r.firstLoginAt && r.status === "ACTIVE" && r.validUntil > now) b.active++;
    else b.finished++;
    if (r.firstLoginAt) b.value += r.priceXaf ?? 0;
    if (r.createdAt < b.created) b.created = r.createdAt;
    batches.set(r.ticketBatch!, b);
  }
  const list = [...batches.entries()].sort((a, b) => b[1].created.getTime() - a[1].created.getTime());
  return (
    <>
      <PageHeader
        title="Printed tickets"
        description="Create username + password tickets in advance and sell them offline. Customers type them on the Wi-Fi login page; their time starts at the first login."
      />
      <Card className="mb-6">
        <CardHeader title="Generate a batch" />
        <div className="p-4 sm:p-5">
          <TicketGenerator
            packages={packages.map((p) => ({ id: p.id, name: p.name, priceXaf: effectivePrice(p).amount }))}
            networkName={settings.businessName}
            whatsapp={settings.supportWhatsapp}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Batches" description="“Used” value = tickets that have been logged in at least once." />
        {list.length === 0 ? (
          <Empty>No tickets yet.</Empty>
        ) : (
          <Table>
            <thead>
              <tr><Th>Batch</Th><Th>Package</Th><Th>Unused</Th><Th>In use</Th><Th>Finished</Th><Th>Used value</Th><Th /></tr>
            </thead>
            <tbody>
              {list.map(([name, b]) => (
                <tr key={name}>
                  <Td>
                    <span className="font-mono">{name}</span>
                    <div className="text-xs text-muted">{formatDateTime(b.created)} · {b.total} tickets</div>
                  </Td>
                  <Td>{b.pkg}</Td>
                  <Td>{b.unused}</Td>
                  <Td>{b.active ? <Badge tone="ok">{b.active}</Badge> : 0}</Td>
                  <Td>{b.finished}{b.revoked ? <span className="text-xs text-bad"> · {b.revoked} revoked</span> : null}</Td>
                  <Td>{formatXaf(b.value)}</Td>
                  <Td>
                    {b.unused > 0 ? (
                      <span className="flex flex-wrap gap-2">
                        {can(staff.role, "packages:manage") ? <ReprintButton batch={name} networkName={settings.businessName} whatsapp={settings.supportWhatsapp} /> : null}
                        {can(staff.role, "customers:revoke") ? (
                          <ActionButton path={`/api/admin/tickets/${encodeURIComponent(name)}/revoke`} label="Revoke unused" confirm="Disable every unused ticket of this batch? Tickets already in use keep working." variant="danger" />
                        ) : null}
                      </span>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
