"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col">
      {items.map((i) => {
        const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${active ? "bg-brand-50 font-medium text-brand-700" : "text-ink-soft hover:bg-surface"}`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
