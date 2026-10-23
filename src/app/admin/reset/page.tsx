import type { Metadata } from "next";
import { Card } from "@/components/ui/primitives";
import { ResetPasswordForm } from "@/components/admin/auth-forms";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default async function ResetPage(props: PageProps<"/admin/reset">) {
  const { token } = await props.searchParams;
  return (
    <main className="flex flex-1 items-center justify-center bg-surface px-4 py-12">
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-4 text-lg font-semibold">Set a new password</h1>
        {typeof token === "string" ? <ResetPasswordForm token={token} /> : <p className="text-sm text-muted">This link is incomplete. Ask a super admin for a new one.</p>}
      </Card>
    </main>
  );
}
