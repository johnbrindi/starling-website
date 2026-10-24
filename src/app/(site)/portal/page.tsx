import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCustomer } from "@/server/auth/session";
import { getAccessStatus } from "@/server/subscriptions/status";
import { listActivePackages } from "@/server/catalog";
import { PortalCapture } from "@/components/customer/portal-capture";
import { PlanCard } from "@/components/customer/plan-card";
import { Alert } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";
import { DeviceMacHelp } from "@/components/customer/device-mac-help";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Welcome" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 300) : null);

/**
 * Captive-portal entry. The MikroTik hotspot login.html redirects unauthenticated devices here with
 * ?login=$(link-login-only)&mac=$(mac)&ip=$(ip)&error=$(error). See network/mikrotik/hotspot/login.html.
 */
export default async function PortalPage(props: PageProps<"/portal">) {
  const sp = await props.searchParams;
  const routerError = str(sp.error);
  const ctx = await getCustomer();
  if (ctx && !routerError) {
    const status = await getAccessStatus(ctx.customer.id);
    if (status.state === "READY" || status.state === "PROVISIONING" || status.state === "ONLINE") redirect("/account");
  }
  const [plans, settings] = await Promise.all([listActivePackages(), getSettings()]);
  const expired = ctx ? (await getAccessStatus(ctx.customer.id)).state === "EXPIRED" : false;
  return (
    <div className="space-y-6">
      <PortalCapture loginUrl={str(sp.login)} mac={str(sp.mac)} ip={str(sp.ip)} plan={str(sp.plan)} />
      {routerError ? (
        <Alert tone="bad" title="The Wi-Fi did not accept the login">
          {routerError}. If your time has ended, buy a new pass below. Otherwise check the code on your access page.
        </Alert>
      ) : expired ? (
        <Alert tone="warn" title="Your Wi-Fi time has ended">Buy a new pass to continue browsing.</Alert>
      ) : null}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Juthelink</h1>
        <p className="mt-1 text-sm text-ink-soft">Choose a pass, pay with MTN MoMo, and you are connected automatically.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} />
        ))}
      </div>
      <DeviceMacHelp networkName={settings.businessName} open={!!routerError} />
      {ctx ? (
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/account" variant="secondary">My Wi-Fi</LinkButton>
          <LinkButton href="/redeem" variant="secondary">Redeem a voucher card</LinkButton>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="font-medium">New here? Create a free account first.</p>
          <p className="mt-1 text-sm text-muted">It takes 30 seconds and keeps your access code safe.</p>
          <div className="mt-3 flex flex-col gap-2 min-[400px]:flex-row">
            <LinkButton href="/register?next=/plans" size="lg">Create account</LinkButton>
            <LinkButton href="/login?next=/account" size="lg" variant="secondary">Sign in</LinkButton>
          </div>
        </div>
      )}
    </div>
  );
}
