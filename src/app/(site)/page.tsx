import Link from "next/link";
import { listActivePackages } from "@/server/catalog";
import { getSettings } from "@/server/settings";
import { getCustomer } from "@/server/auth/session";
import { PlanCard } from "@/components/customer/plan-card";
import { LinkButton } from "@/components/ui/button";
import { PhoneIcon, ShieldIcon, TicketIcon, WifiIcon } from "@/components/ui/icons";

const STEPS = [
  { icon: ShieldIcon, title: "Create your account", text: "Your name, phone number and a password. Free, 30 seconds." },
  { icon: TicketIcon, title: "Choose a pass", text: "From 1 hour to 1 month. Prices in FCFA." },
  { icon: PhoneIcon, title: "Pay with Mobile Money", text: "Approve the MTN MoMo prompt on your phone." },
  { icon: WifiIcon, title: "Connect with your code", text: "Tap Connect. Your personal code logs your device in." },
];

export default async function HomePage() {
  const [plans, settings, ctx] = await Promise.all([listActivePackages(), getSettings(), getCustomer()]);
  return (
    <div className="space-y-12">
      <section className="max-w-2xl">
        <p className="text-sm font-medium text-brand-700">Satellite internet · {settings.businessName}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Fast Wi-Fi from 105 FCFA.</h1>
        <p className="mt-3 text-ink-soft">Buy a pass with Mobile Money and get online in under a minute. Your time and access code are always in your account.</p>
        <div className="mt-6 flex flex-col gap-2 min-[400px]:flex-row">
          {ctx ? (
            <>
              <LinkButton href="/account" size="lg">Go to My Wi-Fi</LinkButton>
              <LinkButton href="/plans" size="lg" variant="secondary">Buy more time</LinkButton>
            </>
          ) : (
            <>
              <LinkButton href="/register?next=/plans" size="lg">Get started</LinkButton>
              <LinkButton href="/login" size="lg" variant="secondary">Sign in</LinkButton>
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="text-lg font-semibold">How it works</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-line bg-white p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <s.icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold text-muted">STEP {i + 1}</span>
              </div>
              <p className="mt-3 font-medium text-ink">{s.title}</p>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="plans">
        <div className="mb-4 flex items-end justify-between">
          <h2 id="plans" className="text-lg font-semibold">Plans and prices</h2>
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

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Need help?</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Call <a className="font-medium text-brand-700" href={`tel:${settings.supportPhone.replace(/\s/g, "")}`}>{settings.supportPhone}</a> ({settings.supportHours}) or read the{" "}
          <Link href="/help" className="font-medium text-brand-700">frequently asked questions</Link>.
        </p>
      </section>
    </div>
  );
}
