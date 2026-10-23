import Link from "next/link";
import { getCustomer } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { WifiIcon } from "@/components/ui/icons";
import { BottomNav } from "@/components/customer/bottom-nav";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const [settings, ctx] = await Promise.all([getSettings(), getCustomer()]);
  const firstName = ctx?.customer.name?.split(" ")[0];
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white">
              <WifiIcon className="h-5 w-5" />
            </span>
            <span className="truncate">{settings.businessName}</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/plans" className="hidden rounded-md px-3 py-2 text-ink-soft hover:bg-surface sm:block">
              Plans
            </Link>
            <Link href="/help" className="hidden rounded-md px-3 py-2 text-ink-soft hover:bg-surface sm:block">
              Help
            </Link>
            {ctx ? (
              <Link href="/account" className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 hover:bg-surface">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                  {(firstName ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="max-w-[7rem] truncate font-medium text-ink">{firstName ?? "My Wi-Fi"}</span>
              </Link>
            ) : (
              <>
                <Link href="/login" className="rounded-md px-3 py-2 font-medium text-ink-soft hover:bg-surface">
                  Sign in
                </Link>
                <Link href="/register" className="hidden rounded-md bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700 min-[380px]:block">
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6 text-[15px] sm:pb-12 sm:pt-10 sm:text-base">{children}</main>
      <footer className="hidden border-t border-line bg-surface sm:block">
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
      <BottomNav />
    </div>
  );
}
