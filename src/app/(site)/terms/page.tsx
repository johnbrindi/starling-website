import type { Metadata } from "next";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Terms of service" };

// TEMPLATE: review with a legal adviser before commercial launch.
export default async function TermsPage() {
  const s = await getSettings();
  return (
    <article className="mx-auto max-w-3xl space-y-4 text-sm leading-6 text-ink-soft">
      <PageHeader title="Terms of service" description="Last updated: October 2026" />
      <h2 className="text-base font-semibold text-ink">1. The service</h2>
      <p>
        {s.businessName} sells time-limited access to a shared Wi-Fi network connected to satellite internet. Speeds vary with the number of users,
        weather and the satellite link. We do not guarantee a minimum speed or uninterrupted service.
      </p>
      <h2 className="text-base font-semibold text-ink">2. Passes and time</h2>
      <p>
        A pass starts when payment is confirmed and runs continuously until its end time, whether or not you are connected. Each pass allows the number of
        simultaneous devices stated on the plan. Buying again before the end adds time after the current pass.
      </p>
      <h2 className="text-base font-semibold text-ink">3. Payments and refunds</h2>
      <p>
        Prices are in FCFA (XAF). Access is granted only after the payment provider confirms the payment. If you were charged but did not receive access,
        contact support with your payment reference and we will issue the access or a refund after verification.
      </p>
      <h2 className="text-base font-semibold text-ink">4. Fair and lawful use</h2>
      <p>
        Do not use the network for illegal activity, to attack other devices or networks, or to resell access. We may limit speed for very heavy use so
        that everyone gets a fair share, and we may end access that breaks these rules.
      </p>
      <h2 className="text-base font-semibold text-ink">5. Your codes</h2>
      <p>Keep your access code private. Anyone with it can use your pass, up to its device limit.</p>
      <h2 className="text-base font-semibold text-ink">6. Contact</h2>
      <p>Support: {s.supportPhone}.</p>
    </article>
  );
}
