import Link from "next/link";
import { requireStaffPage } from "@/server/admin/guard";
import { can } from "@/server/auth/rbac";
import { db } from "@/server/db";
import { formatDateTime, formatXaf } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { Badge, Card, Empty, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/admin/admin-context";

const STATUSES = ["PENDING", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED", "REFUNDED"] as const;
const tone = { SUCCEEDED: "ok", PENDING: "warn", FAILED: "bad", CANCELLED: "neutral", EXPIRED: "neutral", REFUNDED: "neutral" } as const;

export default async function PaymentsPage(props: PageProps<"/admin/payments">) {
  const { staff } = await requireStaffPage("payments:view");
  const sp = await props.searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 60);
  const payments = await db.payment.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ reference: { contains: q.toUpperCase() } }, { payerPhone: { contains: q.replace(/\D/g, "") || q } }, { providerReference: { contains: q } }] } : {}),
    },
    include: { package: { select: { name: true } }, subscription: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const canReconcile = can(staff.role, "payments:reconcile");
  return (
    <>
      <PageHeader title="Payments" description="Every Mobile Money transaction. Access is granted only after the provider confirms; staff cannot mark a payment as paid." />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Reference or phone" className="max-w-xs" aria-label="Search payments" />
        <Select name="status" defaultValue={status ?? ""} className="max-w-[10rem]" aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.toLowerCase()}</option>
          ))}
        </Select>
        <Button type="submit">Filter</Button>
      </form>
      <Card>
        {payments.length === 0 ? <Empty>No payments match.</Empty> : (
          <Table>
            <thead><tr><Th>Created</Th><Th>Reference</Th><Th>Customer</Th><Th>Pass</Th><Th>Amount</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <Td>{formatDateTime(p.createdAt)}</Td>
                  <Td>
                    <span className="font-mono text-xs">{p.reference}</span>
                    <div className="text-xs text-muted">{p.provider.toLowerCase()} {p.channel ?? ""} {p.providerReference ? `· ${p.providerReference}` : ""}</div>
                  </Td>
                  <Td><Link className="text-brand-700 hover:underline" href={`/admin/customers/${p.customerId}`}>{formatPhone(p.payerPhone)}</Link></Td>
                  <Td>{p.package.name}</Td>
                  <Td>{formatXaf(p.amountXaf)}{p.isSimulated ? <div><Badge tone="warn">simulated</Badge></div> : null}</Td>
                  <Td>
                    <Badge tone={tone[p.status]}>{p.status.toLowerCase()}</Badge>
                    {p.status === "SUCCEEDED" && !p.subscription ? <div className="mt-1"><Badge tone="bad">no pass yet</Badge></div> : null}
                    {p.failureReason ? <div className="mt-1 max-w-[16rem] text-xs text-muted">{p.failureReason}</div> : null}
                  </Td>
                  <Td>{canReconcile && (p.status === "PENDING" || (p.status === "SUCCEEDED" && !p.subscription)) ? <ActionButton path={`/api/admin/payments/${p.id}/verify`} label="Re-check" /> : null}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
