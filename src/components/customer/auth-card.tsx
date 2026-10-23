import type { ReactNode } from "react";
import { WifiIcon } from "@/components/ui/icons";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <WifiIcon className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
      </div>
      <div className="rounded-xl border border-line bg-white p-5 sm:p-6">{children}</div>
      {footer ? <div className="mt-5 text-center text-sm text-muted">{footer}</div> : null}
    </div>
  );
}
