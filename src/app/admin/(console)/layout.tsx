import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaff } from "@/server/auth/session";
import { can, ROLE_LABELS } from "@/server/auth/rbac";
import { getNetworkAdapter } from "@/server/network";
import { getActiveProvider } from "@/server/payments/registry";
import { AdminProvider } from "@/components/admin/admin-context";
import { AdminNav } from "@/components/admin/nav";
import { StaffSignOut } from "@/components/admin/auth-forms";

export const metadata: Metadata = { title: { default: "Console", template: "%s · Console" }, robots: { index: false } };

export default async function ConsoleLayout({ children }: LayoutProps<"/admin">) {
  const ctx = await getStaff();
  if (!ctx) redirect("/admin/login");
  const role = ctx.staff.role;
  const items = [
    { href: "/admin", label: "Dashboard", show: true },
    { href: "/admin/sell", label: "Sell a pass", show: can(role, "sales:create") },
    { href: "/admin/tickets", label: "Printed tickets", show: can(role, "sales:create") },
    { href: "/admin/customers", label: "Customers", show: can(role, "customers:view") },
    { href: "/admin/payments", label: "Payments", show: can(role, "payments:view") },
    { href: "/admin/packages", label: "Packages", show: can(role, "dashboard:view") },
    { href: "/admin/vouchers", label: "Online vouchers", show: can(role, "payments:view") },
    { href: "/admin/network", label: "Network", show: can(role, "network:view") },
    { href: "/admin/audit", label: "Audit log", show: can(role, "audit:view") },
    { href: "/admin/staff", label: "Staff", show: can(role, "staff:manage") },
    { href: "/admin/settings", label: "Settings", show: can(role, "dashboard:view") },
  ].filter((i) => i.show);
  let simulatedPay = true;
  try {
    simulatedPay = getActiveProvider().simulated;
  } catch {
    simulatedPay = false;
  }
  const simulatedNet = getNetworkAdapter().simulated;

  return (
    <AdminProvider csrf={ctx.csrfToken}>
      {simulatedPay || simulatedNet ? (
        <div className="bg-warn-bg px-4 py-1.5 text-center text-xs font-medium text-warn">
          Test mode: {[simulatedPay && "payments are simulated", simulatedNet && "router is simulated"].filter(Boolean).join(" · ")}. Figures below include
          no real revenue from simulated payments.
        </div>
      ) : null}
      <div className="flex min-h-full flex-1 flex-col lg:flex-row">
        <aside className="border-b border-line bg-white px-3 py-3 lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r lg:py-5">
          <div className="mb-3 hidden px-3 lg:block">
            <Link href="/admin" className="text-sm font-semibold">
              Starling console
            </Link>
            <p className="text-xs text-muted">
              {ctx.staff.name} · {ROLE_LABELS[role]}
            </p>
          </div>
          <AdminNav items={items} />
          <div className="mt-4 hidden px-3 lg:block">
            <StaffSignOut />
          </div>
        </aside>
        <main className="min-w-0 flex-1 bg-surface px-4 py-6 sm:px-6">{children}</main>
      </div>
    </AdminProvider>
  );
}
