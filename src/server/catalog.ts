import "server-only";
import type { Package } from "@/generated/prisma/client";
import type { PackageDto } from "@/lib/types";
import { db } from "./db";
import { effectivePrice } from "./payments/service";

export function toPackageDto(p: Package): PackageDto {
  const { amount, promoActive } = effectivePrice(p);
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
    usagePolicy: p.usagePolicy,
    isFeatured: p.isFeatured,
  };
}

export async function listActivePackages(): Promise<PackageDto[]> {
  const rows = await db.package.findMany({ where: { status: "ACTIVE" }, orderBy: [{ sortOrder: "asc" }, { priceXaf: "asc" }] });
  return rows.map(toPackageDto);
}

export async function getActivePackageBySlug(slug: string): Promise<PackageDto | null> {
  const p = await db.package.findUnique({ where: { slug } });
  return p && p.status === "ACTIVE" ? toPackageDto(p) : null;
}
