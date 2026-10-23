import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCustomer } from "@/server/auth/session";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { toPaymentDto } from "@/server/payments/dto";
import { PaymentStatus } from "@/components/customer/payment-status";

export const metadata: Metadata = { title: "Payment" };

export default async function PayPage(props: PageProps<"/pay/[id]">) {
  const { id } = await props.params;
  const ctx = await getCustomer();
  if (!ctx) redirect("/account");
  const payment = await db.payment.findUnique({ where: { id }, include: { package: true } });
  if (!payment || payment.customerId !== ctx.customer.id) notFound();
  const e = env();
  return (
    <div className="mx-auto max-w-md">
      <PaymentStatus initial={toPaymentDto(payment)} devSimulator={e.NODE_ENV !== "production" && e.ALLOW_SIMULATED_PAYMENTS} />
    </div>
  );
}
