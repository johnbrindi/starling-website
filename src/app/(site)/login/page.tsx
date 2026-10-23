import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCustomer } from "@/server/auth/session";
import { AuthCard } from "@/components/customer/auth-card";
import { LoginForm } from "@/components/customer/auth-forms";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  if (await getCustomer()) redirect(next);
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in with your phone number and password."
      footer={
        <>
          New here?{" "}
          <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm next={next} />
    </AuthCard>
  );
}
