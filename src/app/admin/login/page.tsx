import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaff } from "@/server/auth/session";
import { Card } from "@/components/ui/primitives";
import { StaffLoginForm } from "@/components/admin/auth-forms";
import { ShieldIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false }, manifest: "/admin.webmanifest", appleWebApp: { capable: true, title: "JL Admin", statusBarStyle: "default" } };

export default async function StaffLoginPage() {
  if (await getStaff()) redirect("/admin");
  return (
    <main className="flex flex-1 items-center justify-center bg-surface px-4 py-12">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-white">
            <ShieldIcon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Juthelink</p>
            <p className="text-xs text-muted">Operator console</p>
          </div>
        </div>
        <StaffLoginForm />
      </Card>
    </main>
  );
}
