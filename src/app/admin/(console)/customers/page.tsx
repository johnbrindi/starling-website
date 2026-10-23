import Link from "next/link";
import { requireStaffPage } from "@/server/admin/guard";
import { db } from "@/server/db";
import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { Badge, Card, Empty, Input, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export default async function CustomersPage(props: PageProps<"/admin/customers">) {
  await requireStaffPage("customers:view");
  const sp = await props.searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 40);
  const digits = q.replace(/\D/g, "");
  const customers = await db.customer.findMany({
    where: q
      ? {
          OR: [
            ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
            { name: { contains: q, mode: "insensitive" as const } },
            { credentials: { some: { username: q.toUpperCase().replace(/[^A-Z0-9]/g, "") } } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      _count: { select: { payments: true, subscriptions: true } },
      credentials: { where: { status: "ACTIVE", validUntil: { gt: new Date() } }, select: { id: true }, take: 1 },
    },
  });
  return (
    <>
      <PageHeader title="Customers" description="Search by phone number, name or access code." />
      <form className="mb-4 flex max-w-md gap-2">
        <Input name="q" defaultValue={q} placeholder="670000000 or K7M4QX2P" aria-label="Search customers" />
        <Button type="submit">Search</Button>
      </form>
      <Card>
        {customers.length === 0 ? (
          <Empty>No customers found.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Phone</Th>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th>Payments</Th>
                <Th>Passes</Th>
                <Th>Since</Th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <Link href={`/admin/customers/${c.id}`} className="font-medium text-brand-700 hover:underline">
                      {formatPhone(c.phone)}
                    </Link>
                  </Td>
                  <Td>{c.name ?? "—"}</Td>
                  <Td>{c.isBlocked ? <Badge tone="bad">blocked</Badge> : c.credentials.length ? <Badge tone="ok">active pass</Badge> : <Badge>no pass</Badge>}</Td>
                  <Td>{c._count.payments}</Td>
                  <Td>{c._count.subscriptions}</Td>
                  <Td>{formatDateTime(c.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
