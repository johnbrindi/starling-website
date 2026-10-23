import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCustomer } from "@/server/auth/session";
import { AuthCard } from "@/components/customer/auth-card";
import { RegisterForm } from "@/components/customer/auth-forms";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Create your account" };

export default async function RegisterPage(props: PageProps<"/register">) {
  const sp = await props.searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  if (await getCustomer()) redirect(next);
  return (
    <AuthCard
      title="Create your account"
      subtitle="Free and takes 30 seconds. Your passes and access codes stay safe in your account."
      footer={
        <>
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm next={next} />
    </AuthCard>
  );
}
