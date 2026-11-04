import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCustomer } from "@/server/auth/session";
import { AuthCard } from "@/components/customer/auth-card";
import { EmailForm } from "@/components/customer/forms";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Add your email" };

/** Shown once after sign-in to accounts created before emails were asked for. */
export default async function AddEmailPage(props: PageProps<"/account/email">) {
  const sp = await props.searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  const ctx = await getCustomer();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (ctx.customer.email) redirect(next);
  return (
    <AuthCard
      title="Add your email"
      subtitle="If you ever forget your password, we send you a code by email. It takes 10 seconds."
      footer={<Link href={next} className="text-muted underline">Skip for now</Link>}
    >
      <EmailForm initialEmail="" next={next} />
    </AuthCard>
  );
}
