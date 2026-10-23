import { requireStaffPage } from "@/server/admin/guard";
import { db } from "@/server/db";
import { formatDateTime } from "@/lib/format";
import { Card, Input, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export default async function AuditPage(props: PageProps<"/admin/audit">) {
  await requireStaffPage("audit:view");
  const sp = await props.searchParams;
  const action = typeof sp.action === "string" ? sp.action.slice(0, 60) : "";
  const [events, staff] = await Promise.all([
    db.auditEvent.findMany({ where: action ? { action: { startsWith: action } } : undefined, orderBy: { createdAt: "desc" }, take: 200 }),
    db.staffUser.findMany({ select: { id: true, email: true } }),
  ]);
  const who = Object.fromEntries(staff.map((s) => [s.id, s.email]));
  return (
    <>
      <PageHeader title="Audit log" description="Security-relevant actions by staff, customers, providers and the system. Secrets are redacted." />
      <form className="mb-4 flex max-w-md gap-2">
        <Input name="action" defaultValue={action} placeholder="e.g. staff. or credential.revoked" aria-label="Filter by action" />
        <Button type="submit">Filter</Button>
      </form>
      <Card>
        <Table>
          <thead><tr><Th>Time</Th><Th>Action</Th><Th>Actor</Th><Th>Target</Th><Th>IP</Th><Th>Details</Th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap">{formatDateTime(e.createdAt)}</Td>
                <Td className="font-mono text-xs">{e.action}</Td>
                <Td>{e.actorType === "STAFF" && e.actorId ? (who[e.actorId] ?? "staff") : e.actorType.toLowerCase()}</Td>
                <Td className="text-xs">{e.targetType} {e.targetId?.slice(-8)}</Td>
                <Td className="text-xs">{e.ipAddress}</Td>
                <Td><code className="block max-w-sm truncate text-[11px] text-muted" title={JSON.stringify(e.metadata)}>{JSON.stringify(e.metadata)}</code></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
