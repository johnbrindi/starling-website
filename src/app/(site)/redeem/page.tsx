import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui/primitives";
import { VoucherForm } from "@/components/customer/forms";

export const metadata: Metadata = { title: "Redeem a voucher" };

export default function RedeemPage() {
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Redeem a voucher card" description="Cards are sold at the counter for cash. Each card works once." />
      <Card className="p-4 sm:p-5">
        <VoucherForm />
      </Card>
    </div>
  );
}
