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
      subtitle="Choose the easiest way to prove it is you, then pick a new password."
      footer={
        <>
          Remembered it? <Link href="/login" className="font-semibold text-brand-700">Back to sign in</Link>
        </>
      }
    >
      <ResetPasswordForm next={next} support={s.supportWhatsapp} />
    </AuthCard>
  );
}
