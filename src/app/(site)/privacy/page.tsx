import type { Metadata } from "next";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Privacy policy" };

// TEMPLATE: have this reviewed against Cameroonian data-protection law before commercial launch (see docs/access-control.md).
export default async function PrivacyPage() {
  const s = await getSettings();
  return (
    <article className="mx-auto max-w-3xl space-y-4 text-sm leading-6 text-ink-soft">
      <PageHeader title="Privacy policy" description="Last updated: October 2026" />
      <p>
        {s.businessName} (&quot;we&quot;) provides paid Wi-Fi access. This policy explains what we collect and why. We collect only what we need to sell and
        deliver internet access.
      </p>
      <h2 className="pt-2 text-base font-semibold text-ink">What we collect</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Your mobile number: to request the Mobile Money payment, to let you recover your access, and to prevent fraud.</li>
        <li>Optional name, if you give it.</li>
        <li>Payment records: amount, date, operator, and the payment provider&apos;s reference. We never see or store your Mobile Money PIN.</li>
        <li>Network session data: device MAC and local IP address, connection times and data volume, to enforce your pass and device limit.</li>
        <li>Notification subscriptions, only if you turn reminders on.</li>
      </ul>
      <p>We do not record the websites you visit in this application.</p>
      <h2 className="pt-2 text-base font-semibold text-ink">Who we share it with</h2>
      <p>Your number and the amount are sent to our payment provider to process the payment. We do not sell your data.</p>
      <h2 className="pt-2 text-base font-semibold text-ink">How long we keep it</h2>
      <p>
        Payment records are kept for accounting obligations. Session and usage records are kept for up to 12 months, unless the law requires otherwise.
        Payment-provider notifications are deleted after 6 months.
      </p>
      <h2 className="pt-2 text-base font-semibold text-ink">Your rights</h2>
      <p>
        You can ask to see, correct or delete your data (except records we must keep) by contacting {s.supportPhone}.
      </p>
    </article>
  );
}
