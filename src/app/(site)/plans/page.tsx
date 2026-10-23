import type { Metadata } from "next";
import { listActivePackages } from "@/server/catalog";
import { PlanCard } from "@/components/customer/plan-card";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Plans and prices" };

export default async function PlansPage() {
  const plans = await listActivePackages();
  return (
    <>
      <PageHeader title="Plans and prices" description="All prices in FCFA (XAF). Your time starts when the payment is confirmed." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} />
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">
        Buying again before your time ends adds the new time after your current pass, on the same code (unless the operator has changed this setting).
      </p>
    </>
  );
}
