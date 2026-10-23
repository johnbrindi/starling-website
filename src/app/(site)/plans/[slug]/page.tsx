import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getActivePackageBySlug } from "@/server/catalog";
import { getCustomer } from "@/server/auth/session";
import { getActiveProvider } from "@/server/payments/registry";
import { formatDuration, formatXaf } from "@/lib/format";
import { Card } from "@/components/ui/primitives";
import { CheckoutForm } from "@/components/customer/checkout-form";
import { CheckIcon } from "@/components/ui/icons";

export async function generateMetadata(props: PageProps<"/plans/[slug]">): Promise<Metadata> {
  const plan = await getActivePackageBySlug((await props.params).slug);
  return { title: plan ? `${plan.name} pass` : "Plan" };
}

export default async function PlanPage(props: PageProps<"/plans/[slug]">) {
  const { slug } = await props.params;
  const [plan, customer] = await Promise.all([getActivePackageBySlug(slug), getCustomer()]);
  if (!plan) notFound();
  const simulated = getActiveProvider().simulated;
  return (
    <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-[1fr_1.1fr]">
      <div>
        <Link href="/plans" className="text-sm text-muted hover:text-ink">
          ← All plans
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">{plan.name}</h1>
        <p className="mt-1 text-3xl font-semibold text-brand-700">{formatXaf(plan.effectivePriceXaf)}</p>
        {plan.description ? <p className="mt-3 text-sm text-ink-soft">{plan.description}</p> : null}
        <ul className="mt-4 space-y-2 text-sm text-ink-soft">
          {[
            `${formatDuration(plan.durationMinutes)} of internet from activation`,
            `${plan.maxDevices} device${plan.maxDevices > 1 ? "s" : ""} connected at the same time`,
            plan.dataLimitMb ? `${(plan.dataLimitMb / 1024).toFixed(1)} GB data allowance` : "No data cap (fair use applies)",
            "Code delivered on screen right after payment",
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> {t}
            </li>
          ))}
        </ul>
        {plan.usagePolicy ? <p className="mt-4 text-xs text-muted">{plan.usagePolicy}</p> : null}
      </div>
      <Card className="p-4 sm:p-5">
        <CheckoutForm plan={plan} defaultPhone={customer?.customer.phone} simulated={simulated} />
      </Card>
    </div>
  );
}
