import Link from "next/link";
import { listActivePackages } from "@/server/catalog";
import { getSettings } from "@/server/settings";
import { PlanCard } from "@/components/customer/plan-card";
import { LinkButton } from "@/components/ui/button";
import { PhoneIcon, TicketIcon, WifiIcon } from "@/components/ui/icons";

export default async function HomePage() {
  const [plans, settings] = await Promise.all([listActivePackages(), getSettings()]);
  return (
    <div className="space-y-12">
      <section className="grid items-center gap-6 sm:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="text-sm font-medium text-brand-700">Satellite internet · {settings.businessName}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Fast Wi-Fi from 100 FCFA.</h1>
          <p className="mt-3 max-w-lg text-ink-soft">
            Choose a pass, pay with MTN Mobile Money or Orange Money, and get your access code in seconds. No account or app needed.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <LinkButton href="/plans" size="lg">
              Buy a pass
            </LinkButton>
            <LinkButton href="/account" size="lg" variant="secondary">
              I already paid
            </LinkButton>
          </div>
        </div>
        <ol className="space-y-3 rounded-lg border border-line bg-surface p-4 text-sm">
          {[
            [WifiIcon, "Connect to the Wi-Fi", `Join "${settings.businessName}" on your phone. This page opens automatically.`],
            [PhoneIcon, "Pay with Mobile Money", "Approve the request on your phone with your PIN."],
            [TicketIcon, "Tap Connect", "Your code activates the internet for the time you bought."],
          ].map(([Icon, title, text], i) => {
            const I = Icon as typeof WifiIcon;
            return (
              <li key={i} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-brand-700 ring-1 ring-line">
                  <I className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium text-ink">{title as string}</p>
                  <p className="text-muted">{text as string}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-lg font-semibold">Plans and prices</h2>
          <Link href="/redeem" className="text-sm font-medium text-brand-700 hover:underline">
            Have a voucher card?
          </Link>
        </div>
        {plans.length === 0 ? (
          <p className="text-sm text-muted">No plans are available right now. Please check back soon.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {plans.map((p) => (
              <PlanCard key={p.id} plan={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
