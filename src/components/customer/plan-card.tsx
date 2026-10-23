import Link from "next/link";
import type { PackageDto } from "@/lib/types";
import { formatDuration, formatXaf } from "@/lib/format";
import { DevicesIcon } from "@/components/ui/icons";

export function PlanCard({ plan }: { plan: PackageDto }) {
  return (
    <Link
      href={`/plans/${plan.slug}`}
      className={`group flex flex-col rounded-lg border bg-white p-4 transition-colors hover:border-brand-500 ${plan.isFeatured ? "border-brand-500" : "border-line"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted">{plan.name}</p>
        {plan.isFeatured ? <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">Popular</span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold text-ink">
        {formatXaf(plan.effectivePriceXaf)}
        {plan.promoActive ? <span className="ml-2 text-sm font-normal text-muted line-through">{formatXaf(plan.priceXaf)}</span> : null}
      </p>
      <p className="mt-0.5 text-sm text-ink-soft">{formatDuration(plan.durationMinutes)} of internet</p>
      <ul className="mt-3 space-y-1 text-xs text-muted">
        <li className="flex items-center gap-1.5">
          <DevicesIcon className="h-3.5 w-3.5" /> {plan.maxDevices} device{plan.maxDevices > 1 ? "s" : ""} at a time
        </li>
        <li>{plan.dataLimitMb ? `${(plan.dataLimitMb / 1024).toFixed(plan.dataLimitMb % 1024 ? 1 : 0)} GB data` : "No data cap (fair use)"}</li>
      </ul>
      <span className="mt-4 text-sm font-medium text-brand-700 group-hover:underline">Buy this pass</span>
    </Link>
  );
}
