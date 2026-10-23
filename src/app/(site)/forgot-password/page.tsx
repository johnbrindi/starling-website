import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/server/settings";
import { AuthCard } from "@/components/customer/auth-card";
import { ResetPasswordForm } from "@/components/customer/auth-forms";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  const sp = await props.searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  const s = await getSettings();
  return (
    <AuthCard
      title="Reset your password"
      subtitle="Prove the number is yours with a code, then choose a new password."
      footer={
        <>
          No code? Call support on{" "}
          <a className="font-semibold text-brand-700" href={`tel:${s.supportPhone.replace(/\s/g, "")}`}>
            {s.supportPhone}
          </a>{" "}
          for a 6-digit reset code. · <Link href="/login" className="font-semibold text-brand-700">Back to sign in</Link>
        </>
      }
    >
      <ResetPasswordForm next={next} />
    </AuthCard>
  );
}
