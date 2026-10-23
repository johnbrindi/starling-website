import "server-only";
import { z } from "zod";
import { db } from "../db";
import { audit } from "../audit";
import { AppError } from "../errors";

const rateLimitRe = /^\d+(\.\d+)?[kKmMgG]?\/\d+(\.\d+)?[kKmMgG]?$/;

export const packageInputSchema = z
  .object({
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, "Use 2-40 lowercase letters, numbers and dashes."),
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(400).default(""),
    priceXaf: z.number().int("Prices are whole francs.").min(25, "Minimum 25 XAF.").max(1_000_000),
    promoPriceXaf: z.number().int().min(0).max(1_000_000).nullable().default(null),
    promoEndsAt: z.iso.datetime().nullable().default(null),
    durationMinutes: z.number().int().min(5, "Minimum 5 minutes.").max(366 * 24 * 60),
    dataLimitMb: z.number().int().min(1).max(10_000_000).nullable().default(null),
    rateLimit: z.string().trim().regex(rateLimitRe, 'Use MikroTik format "upload/download", e.g. 2M/5M.').nullable().default(null),
    maxDevices: z.number().int().min(1).max(10),
    usagePolicy: z.string().trim().max(1000).default(""),
    status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
    sortOrder: z.number().int().min(0).max(1000).default(0),
    isFeatured: z.boolean().default(false),
    networkProfileId: z.string().nullable().default(null),
  })
  .superRefine((p, ctx) => {
    if (p.promoPriceXaf !== null && p.promoPriceXaf >= p.priceXaf) {
      ctx.addIssue({ code: "custom", path: ["promoPriceXaf"], message: "Promotional price must be lower than the normal price." });
    }
  });

export type PackageInput = z.infer<typeof packageInputSchema>;

function toData(p: PackageInput) {
  return { ...p, promoEndsAt: p.promoEndsAt ? new Date(p.promoEndsAt) : null };
}

async function assertProfile(id: string | null) {
  if (id && !(await db.networkProfile.findUnique({ where: { id } }))) throw new AppError("VALIDATION_FAILED", "Unknown network profile.");
}

export async function createPackage(input: PackageInput, staffId: string, ip?: string) {
  if (await db.package.findUnique({ where: { slug: input.slug } })) throw new AppError("CONFLICT", "A package with this slug already exists.");
  await assertProfile(input.networkProfileId);
  const pkg = await db.package.create({ data: toData(input) });
  await audit({ actorType: "STAFF", actorId: staffId, action: "package.created", targetType: "Package", targetId: pkg.id, ipAddress: ip, metadata: { ...input } });
  return pkg;
}

/** Changes apply to new purchases only; existing subscriptions keep their purchase snapshot. */
export async function updatePackage(id: string, input: PackageInput, staffId: string, ip?: string) {
  const current = await db.package.findUnique({ where: { id } });
  if (!current) throw new AppError("NOT_FOUND", "Package not found.");
  if (current.status === "ARCHIVED" && input.status !== "ARCHIVED") throw new AppError("CONFLICT", "Archived packages cannot be re-activated. Create a new package.");
  const clash = await db.package.findUnique({ where: { slug: input.slug } });
  if (clash && clash.id !== id) throw new AppError("CONFLICT", "Another package already uses this slug.");
  await assertProfile(input.networkProfileId);
  const pkg = await db.package.update({ where: { id }, data: toData(input) });
  await audit({
    actorType: "STAFF",
    actorId: staffId,
    action: "package.updated",
    targetType: "Package",
    targetId: id,
    ipAddress: ip,
    metadata: { before: { priceXaf: current.priceXaf, durationMinutes: current.durationMinutes, status: current.status }, after: input },
  });
  return pkg;
}

export const profileInputSchema = z.object({
  routerName: z.string().trim().regex(/^[A-Za-z0-9_-]{2,40}$/, "Letters, numbers, - and _ only."),
  description: z.string().trim().max(200).default(""),
  rateLimit: z.string().trim().regex(rateLimitRe, 'Use MikroTik format "upload/download", e.g. 2M/5M.').nullable().default(null),
  sharedUsers: z.number().int().min(1).max(10),
  idleTimeout: z.string().trim().regex(/^(none|\d+[smhd])$/).nullable().default("10m"),
});
