import "server-only";
import type { NetworkProfile, Package } from "@/generated/prisma/client";
import { parseRateLimit } from "@/lib/format";
import type { PackageDto } from "@/lib/types";
import { db } from "./db";
import { effectivePrice } from "./payments/service";

export function toPackageDto(p: Package & { networkProfile?: NetworkProfile | null }): PackageDto {
  const { amount, promoActive } = effectivePrice(p);
  const speed = parseRateLimit(p.rateLimit ?? p.networkProfile?.rateLimit);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    priceXaf: p.priceXaf,
    effectivePriceXaf: amount,
    promoActive,
    durationMinutes: p.durationMinutes,
    dataLimitMb: p.dataLimitMb,
    rateLimit: p.rateLimit,
    maxDevices: p.maxDevices,
    downloadSpeed: speed?.download ?? null,
    uploadSpeed: speed?.upload ?? null,
    usagePolicy: p.usagePolicy,
    isFeatured: p.isFeatured,
  };
}

export async function listActivePackages(): Promise<PackageDto[]> {
  const rows = await db.package.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ sortOrder: "asc" }, { priceXaf: "asc" }],
    include: { networkProfile: true },
  });
  return rows.map(toPackageDto);
}

export async function getActivePackageBySlug(slug: string): Promise<PackageDto | null> {
  const p = await db.package.findUnique({ where: { slug }, include: { networkProfile: true } });
  return p && p.status === "ACTIVE" ? toPackageDto(p) : null;
}
