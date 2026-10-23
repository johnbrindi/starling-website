import { requireStaffPage } from "@/server/admin/guard";
import { can } from "@/server/auth/rbac";
import { db } from "@/server/db";
import { Card, CardHeader, Empty, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { VoucherGenerator } from "@/components/admin/voucher-generator";

export default async function VouchersPage() {
  const { staff } = await requireStaffPage("payments:view");
  const [groups, packages] = await Promise.all([
    db.voucher.groupBy({ by: ["batch", "packageId", "status"], _count: true, orderBy: { batch: "desc" } }),
    db.package.findMany({ where: { status: { not: "ARCHIVED" } }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const names = Object.fromEntries(packages.map((p) => [p.id, p.name]));
  const batches = new Map<string, { packageId: string; UNUSED: number; REDEEMED: number; VOID: number }>();
  for (const g of groups) {
    const b = batches.get(g.batch) ?? { packageId: g.packageId, UNUSED: 0, REDEEMED: 0, VOID: 0 };
    b[g.status] += g._count;
    batches.set(g.batch, b);
  }
  return (
    <>
      <PageHeader title="Voucher cards" description="Prepaid codes for cash sales at the counter. Each code works once." />
      {can(staff.role, "packages:manage") ? (
        <Card className="mb-6">
          <CardHeader title="Generate a batch" />
          <div className="p-4"><VoucherGenerator packages={packages} /></div>
        </Card>
      ) : null}
      <Card>
        <CardHeader title="Batches" />
        {batches.size === 0 ? <Empty>No vouchers yet.</Empty> : (
          <Table>
            <thead><tr><Th>Batch</Th><Th>Package</Th><Th>Unused</Th><Th>Redeemed</Th><Th>Void</Th></tr></thead>
            <tbody>
              {[...batches].map(([batch, b]) => (
                <tr key={batch}><Td className="font-mono">{batch}</Td><Td>{names[b.packageId] ?? "archived"}</Td><Td>{b.UNUSED}</Td><Td>{b.REDEEMED}</Td><Td>{b.VOID}</Td></tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
