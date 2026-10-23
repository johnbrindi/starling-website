import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCustomer } from "@/server/auth/session";
import { VoucherForm } from "@/components/customer/forms";
import { TicketIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Redeem a voucher" };

export default async function RedeemPage() {
  if (!(await getCustomer())) redirect("/login?next=/redeem");
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <TicketIcon className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Redeem a voucher card</h1>
        <p className="mt-1.5 text-sm text-muted">Bought a card at the counter? Enter its code to add the pass to your account.</p>
      </div>
      <div className="rounded-xl border border-line bg-white p-5 sm:p-6">
        <VoucherForm />
      </div>
      <ul className="mt-5 space-y-1.5 text-sm text-muted">
        <li>• Each card works once. Your pass starts as soon as you redeem it.</li>
        <li>• You will get a personal access code to connect your devices.</li>
      </ul>
    </div>
  );
}
