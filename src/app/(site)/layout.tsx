import Link from "next/link";
import { getCustomer } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { WifiIcon } from "@/components/ui/icons";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const [settings, customer] = await Promise.all([getSettings(), getCustomer()]);
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-white">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white">
              <WifiIcon className="h-5 w-5" />
            </span>
            <span>{settings.businessName}</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/plans" className="hidden rounded-md px-3 py-2 text-ink-soft hover:bg-surface sm:block">
              Plans
            </Link>
            <Link href="/help" className="hidden rounded-md px-3 py-2 text-ink-soft hover:bg-surface sm:block">
              Help
            </Link>
            <Link href="/account" className="rounded-md bg-brand-50 px-3 py-2 font-medium text-brand-700 hover:bg-brand-100">
              {customer ? "My access" : "Sign in"}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-10">{children}</main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 text-sm text-muted sm:grid-cols-3">
          <div>
            <p className="font-semibold text-ink">{settings.businessName}</p>
            <p className="mt-1">Satellite internet by the hour, day, week or month.</p>
            {settings.location ? <p className="mt-1">{settings.location}</p> : null}
          </div>
          <div>
            <p className="font-semibold text-ink">Support</p>
            <p className="mt-1">
              Call <a className="text-brand-700" href={`tel:${settings.supportPhone.replace(/\s/g, "")}`}>{settings.supportPhone}</a>
            </p>
            {settings.supportWhatsapp ? <p>WhatsApp {settings.supportWhatsapp}</p> : null}
            <p>{settings.supportHours}</p>
          </div>
          <div className="flex flex-col gap-1">
            <Link href="/plans" className="hover:text-ink">Plans and prices</Link>
            <Link href="/redeem" className="hover:text-ink">Redeem a voucher card</Link>
            <Link href="/help" className="hover:text-ink">Help and FAQ</Link>
            <Link href="/terms" className="hover:text-ink">Terms of service</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
