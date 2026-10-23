import type { Metadata } from "next";
import { getSettings } from "@/server/settings";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Help" };

const FAQ: [string, string][] = [
  ["How do I connect?", "Join the Wi-Fi network on your phone. The welcome page opens automatically (if not, open any website such as http://neverssl.com). Choose a pass, pay, then tap Connect."],
  ["Which payment methods are accepted?", "MTN Mobile Money and Orange Money. You approve the payment on your own phone with your PIN. We never ask for your PIN. You can also buy a voucher card for cash at the counter."],
  ["I paid but have no code.", "Open My Wi-Fi. If the payment is still being confirmed, wait one minute; we re-check automatically. You are never charged twice for the same purchase. If money left your account but no pass appears after 10 minutes, contact support with the reference shown on the payment screen."],
  ["When does my time start?", "As soon as the payment is confirmed. The countdown runs in real time, whether or not you are browsing."],
  ["What happens if I buy again before my time ends?", "The new time is added after your current pass, on the same code, so you are not disconnected."],
  ["Can I use my code on several devices?", "Each pass allows a set number of devices at the same time (shown on the plan). Log out one device to use another."],
  ["My code stopped working.", "Check My Wi-Fi. If your time has ended, buy a new pass. If time remains, tap Connect again from the same phone, or contact support."],
  ["Will I be warned before my time ends?", "Yes. My Wi-Fi shows a warning 15, 5 and 1 minutes before the end. Tap \"Remind me before it ends\" to get phone notifications. Reminders while the app is closed depend on your phone allowing notifications."],
  ["Do I need an account?", "Yes. Create a free account with your name, phone number and a password. It keeps your access codes and remaining time safe, and lets you check them from any device."],
  ["What do I do with my access code?", "On your phone, tap \"Connect this device\" on the My Wi-Fi page. On another device, join the Wi-Fi, open any website (for example neverssl.com), type the code on the login page and tap Connect."],
  ["Is my code unique?", "Yes. Every code is randomly generated, never reused, and belongs only to your account. Keep it private: anyone with it can use your time."],
  ["I forgot my password.", "Tap \"Forgot password\" on the sign-in page. Enter your phone number and any access code you received, or a 6-digit code from our support team, then choose a new password."],
];

export default async function HelpPage() {
  const s = await getSettings();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Help and frequently asked questions" />
      <Card className="mb-6 p-4 text-sm sm:p-5">
        <p className="font-semibold">Need a hand?</p>
        <p className="mt-1 text-ink-soft">
          Call <a className="font-medium text-brand-700" href={`tel:${s.supportPhone.replace(/\s/g, "")}`}>{s.supportPhone}</a>
          {s.supportWhatsapp ? <> or WhatsApp {s.supportWhatsapp}</> : null}. {s.supportHours}.
        </p>
      </Card>
      <div className="divide-y divide-line rounded-lg border border-line">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group px-4 py-3 sm:px-5">
            <summary className="cursor-pointer list-none font-medium text-ink marker:hidden">
              <span className="mr-2 inline-block text-brand-600 transition-transform group-open:rotate-90">›</span>
              {q}
            </summary>
            <p className="mt-2 text-sm text-ink-soft">{a}</p>
          </details>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">
        <Link href="/terms" className="underline">Terms of service</Link> · <Link href="/privacy" className="underline">Privacy policy</Link>
      </p>
    </div>
  );
}
