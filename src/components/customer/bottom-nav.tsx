"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SVGProps } from "react";

function I(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6" {...props} />;
}

const items = [
  { href: "/", label: "Home", icon: <I><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></I> },
  { href: "/plans", label: "Plans", icon: <I><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></I> },
  { href: "/account", label: "My Wi-Fi", icon: <I><path d="M2 8.5a15 15 0 0 1 20 0" /><path d="M5.5 12a10 10 0 0 1 13 0" /><path d="M9 15.5a5 5 0 0 1 6 0" /><circle cx="12" cy="19" r="1" fill="currentColor" /></I> },
  { href: "/help", label: "Help", icon: <I><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14" /><circle cx="12" cy="17" r=".8" fill="currentColor" /></I> },
];

/** App-style tab bar on phones (hidden on larger screens). */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] sm:hidden" aria-label="Main">
      <ul className="grid grid-cols-4">
        {items.map((i) => {
          const active = i.href === "/" ? path === "/" : path.startsWith(i.href) || (i.href === "/account" && ["/login", "/register", "/redeem"].some((p) => path.startsWith(p)));
          return (
            <li key={i.href}>
              <Link href={i.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-brand-700" : "text-muted"}`} aria-current={active ? "page" : undefined}>
                {i.icon}
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
