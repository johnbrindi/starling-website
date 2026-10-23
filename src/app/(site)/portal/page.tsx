import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCustomer } from "@/server/auth/session";
import { getAccessStatus } from "@/server/subscriptions/status";
import { listActivePackages } from "@/server/catalog";
import { PortalCapture } from "@/components/customer/portal-capture";
import { PlanCard } from "@/components/customer/plan-card";
import { Alert } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/button";

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
  const plans = await listActivePackages();
  const expired = ctx ? (await getAccessStatus(ctx.customer.id)).state === "EXPIRED" : false;
  return (
    <div className="space-y-6">
      <PortalCapture loginUrl={str(sp.login)} mac={str(sp.mac)} ip={str(sp.ip)} />
      {routerError ? (
        <Alert tone="bad" title="The Wi-Fi did not accept the login">
          {routerError}. If your time has ended, buy a new pass below. Otherwise check the code on your access page.
        </Alert>
      ) : expired ? (
        <Alert tone="warn" title="Your Wi-Fi time has ended">Buy a new pass to continue browsing.</Alert>
      ) : null}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Starling Wi-Fi</h1>
        <p className="mt-1 text-sm text-ink-soft">Pick a pass to get online. Pay with MTN MoMo or Orange Money.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <LinkButton href="/account" variant="secondary">
          I already have a code
        </LinkButton>
        <LinkButton href="/redeem" variant="secondary">
          Redeem a voucher card
        </LinkButton>
      </div>
    </div>
  );
}
