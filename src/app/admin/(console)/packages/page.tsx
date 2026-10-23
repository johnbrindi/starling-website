import { requireStaffPage } from "@/server/admin/guard";
import { can } from "@/server/auth/rbac";
import { db } from "@/server/db";
import { formatDuration, formatXaf } from "@/lib/format";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { PackageRowEditor, type PackageFormValue } from "@/components/admin/package-editor";

export default async function PackagesPage() {
  const { staff } = await requireStaffPage("dashboard:view");
  const canEdit = can(staff.role, "packages:manage");
  const [packages, profiles, sold] = await Promise.all([
    db.package.findMany({ orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { priceXaf: "asc" }], include: { networkProfile: true } }),
    db.networkProfile.findMany({ select: { id: true, routerName: true }, orderBy: { routerName: "asc" } }),
    db.subscription.groupBy({ by: ["packageId"], _count: true }),
  ]);
  const soldBy = Object.fromEntries(sold.map((s) => [s.packageId, s._count]));
  const toForm = (p: (typeof packages)[number]): PackageFormValue => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    priceXaf: p.priceXaf,
    promoPriceXaf: p.promoPriceXaf,
    promoEndsAt: p.promoEndsAt?.toISOString() ?? null,
    durationMinutes: p.durationMinutes,
    dataLimitMb: p.dataLimitMb,
    rateLimit: p.rateLimit,
    maxDevices: p.maxDevices,
    usagePolicy: p.usagePolicy,
    status: p.status,
    sortOrder: p.sortOrder,
    isFeatured: p.isFeatured,
    networkProfileId: p.networkProfileId,
  });
  const blank: PackageFormValue = {
    slug: "",
    name: "",
    description: "",
    priceXaf: 100,
    promoPriceXaf: null,
    promoEndsAt: null,
    durationMinutes: 60,
    dataLimitMb: null,
    rateLimit: null,
    maxDevices: 1,
    usagePolicy: "",
    status: "ACTIVE",
    sortOrder: packages.length * 10,
    isFeatured: false,
    networkProfileId: null,
  };
  return (
    <>
      <PageHeader title="Packages" description="Prices, durations and limits customers can buy. Prices are whole XAF." action={canEdit ? <PackageRowEditor value={blank} profiles={profiles} label="New package" /> : null} />
      <Card>
        <CardHeader title={`${packages.length} packages`} />
        <ul className="divide-y divide-line">
          {packages.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
              <div className="min-w-[12rem] flex-1">
                <p className="font-medium text-ink">
                  {p.name} {p.isFeatured ? <Badge tone="brand">popular</Badge> : null}
                </p>
                <p className="text-xs text-muted">/{p.slug} · sold {soldBy[p.id] ?? 0}×</p>
              </div>
              <span className="w-28 font-medium">{formatXaf(p.priceXaf)}{p.promoPriceXaf !== null ? <span className="block text-xs text-brand-700">promo {formatXaf(p.promoPriceXaf)}</span> : null}</span>
              <span className="w-24 text-ink-soft">{formatDuration(p.durationMinutes)}</span>
              <span className="w-40 text-xs text-muted">
                {p.maxDevices} device(s) · {p.dataLimitMb ? `${p.dataLimitMb} MB` : "no cap"} · {p.rateLimit ?? p.networkProfile?.routerName ?? "default speed"}
              </span>
              <Badge tone={p.status === "ACTIVE" ? "ok" : p.status === "ARCHIVED" ? "neutral" : "warn"}>{p.status.toLowerCase()}</Badge>
              {canEdit && p.status !== "ARCHIVED" ? <PackageRowEditor value={toForm(p)} profiles={profiles} label="Edit" /> : null}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
