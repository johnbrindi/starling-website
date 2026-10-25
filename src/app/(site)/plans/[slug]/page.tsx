import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getActivePackageBySlug } from "@/server/catalog";
import { getCustomer } from "@/server/auth/session";
import { getActiveProvider } from "@/server/payments/registry";
import { formatDuration, formatXaf } from "@/lib/format";
import { CheckoutForm } from "@/components/customer/checkout-form";
import { PurchaseSteps } from "@/components/customer/steps";
import { LinkButton } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";

export async function generateMetadata(props: PageProps<"/plans/[slug]">): Promise<Metadata> {
  const plan = await getActivePackageBySlug((await props.params).slug);
  return { title: plan ? `${plan.name} pass` : "Plan" };
}

export default async function PlanPage(props: PageProps<"/plans/[slug]">) {
  const { slug } = await props.params;
  const [plan, ctx] = await Promise.all([getActivePackageBySlug(slug), getCustomer()]);
  if (!plan) notFound();
  const provider = getActiveProvider();
  const simulated = provider.simulated;
  const manual = provider.id === "MANUAL";
  const here = `/plans/${plan.slug}`;
  return (
    <div className="mx-auto max-w-3xl">
      <PurchaseSteps current={ctx ? 3 : 1} />
      <div className="grid gap-6 sm:grid-cols-[1fr_1.1fr]">
        <div>
          <Link href="/plans" className="text-sm text-muted hover:text-ink">
            ← All plans
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">{plan.name}</h1>
          <p className="mt-1 text-3xl font-semibold text-brand-700">
            {formatXaf(plan.effectivePriceXaf)}
            {plan.promoActive ? <span className="ml-2 text-base font-normal text-muted line-through">{formatXaf(plan.priceXaf)}</span> : null}
          </p>
          {plan.description ? <p className="mt-3 text-sm text-ink-soft">{plan.description}</p> : null}
          <ul className="mt-4 space-y-2 text-sm text-ink-soft">
            {[
              `${formatDuration(plan.durationMinutes)} of internet from activation`,
              `${plan.maxDevices} device${plan.maxDevices > 1 ? "s" : ""} connected at the same time`,
              ...(plan.downloadSpeed ? [`Up to ${plan.downloadSpeed} download / ${plan.uploadSpeed} upload, so everyone gets a fair share`] : []),
              plan.dataLimitMb ? `${(plan.dataLimitMb / 1024).toFixed(1)} GB data allowance` : "No data cap (fair use applies)",
              "Personal access code right after payment",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> {t}
              </li>
            ))}
          </ul>
          {plan.usagePolicy ? <p className="mt-4 text-xs text-muted">{plan.usagePolicy}</p> : null}
        </div>
        <div className="rounded-xl border border-line bg-white p-4 sm:p-5">
          {ctx ? (
            <>
              <p className="mb-4 text-sm text-muted">
                Buying as <span className="font-medium text-ink">{ctx.customer.name ?? ctx.customer.phone}</span>
              </p>
              <CheckoutForm plan={plan} defaultPhone={ctx.customer.phone} simulated={simulated} manual={manual} />
            </>
          ) : (
            <div className="py-2 text-center">
              <h2 className="text-lg font-semibold">Create your free account to continue</h2>
              <p className="mt-1.5 text-sm text-muted">Your account keeps your access code safe and lets you check your remaining time on any device.</p>
              <div className="mt-5 space-y-2">
                <LinkButton href={`/register?next=${encodeURIComponent(here)}`} size="lg" className="w-full">
                  Create account
                </LinkButton>
                <LinkButton href={`/login?next=${encodeURIComponent(here)}`} size="lg" variant="secondary" className="w-full">
                  I already have an account
                </LinkButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
