import { requireStaffPage } from "@/server/admin/guard";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { getNetworkAdapter } from "@/server/network";
import { effectivePrice } from "@/server/payments/service";
import { formatDateTime, formatXaf } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { Card, CardHeader, Empty, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { SellForm } from "@/components/admin/sell-form";

export default async function SellPage() {
  await requireStaffPage("sales:create");
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [packages, settings, today] = await Promise.all([
    db.package.findMany({ where: { status: { in: ["ACTIVE", "INACTIVE"] } }, orderBy: [{ sortOrder: "asc" }, { priceXaf: "asc" }] }),
    getSettings(),
    db.payment.findMany({ where: { provider: "CASH", createdAt: { gte: since } }, include: { package: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const total = today.reduce((s, p) => s + p.amountXaf, 0);
  return (
    <>
      <PageHeader
        title="Sell a pass"
        description="Counter sale for cash: the system creates the customer's Wi-Fi login (username + password, like a cyber café) and pushes it to the router."
      />
      <Card className="mb-6">
        <div className="p-4 sm:p-5">
          <SellForm
            packages={packages.map((p) => ({ id: p.id, name: p.name, priceXaf: effectivePrice(p).amount, durationMinutes: p.durationMinutes }))}
            networkName={settings.businessName}
            simulatedRouter={getNetworkAdapter().simulated}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title={`Cash sales today: ${today.length} · ${formatXaf(total)}`} description="Count the cash drawer against this total." />
        {today.length === 0 ? (
          <Empty>No cash sales yet today.</Empty>
        ) : (
          <Table>
            <thead>
              <tr><Th>Time</Th><Th>Customer</Th><Th>Pass</Th><Th>Amount</Th><Th>Reference</Th></tr>
            </thead>
            <tbody>
              {today.map((p) => (
                <tr key={p.id}>
                  <Td>{formatDateTime(p.createdAt)}</Td>
                  <Td>{formatPhone(p.payerPhone)}</Td>
                  <Td>{p.package.name}</Td>
                  <Td>{formatXaf(p.amountXaf)}</Td>
                  <Td className="font-mono text-xs">{p.reference}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
