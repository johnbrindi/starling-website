import { z } from "zod";
import { db } from "@/server/db";
import { json, readJson } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { generateVouchers } from "@/server/subscriptions/service";

/** GET /api/admin/vouchers — batches with counts. */
export const GET = staffRoute("payments:view", async () => {
  const rows = await db.voucher.groupBy({ by: ["batch", "packageId", "status"], _count: true });
  return json({ batches: rows });
});

/** POST /api/admin/vouchers — { packageId, count, batch, expiresAt? }. Codes are returned ONCE. */
export const POST = staffRoute("packages:manage", async (req, staff) => {
  const input = await readJson(
    req,
    z.object({
      packageId: z.string().min(1),
      count: z.number().int().min(1).max(500),
      batch: z.string().trim().regex(/^[A-Za-z0-9_-]{2,30}$/),
      expiresAt: z.iso.datetime().nullable().default(null),
    }),
  );
  const res = await generateVouchers({ ...input, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }, staff.staff.id);
  return json({ batch: input.batch, packageName: res.package.name, codes: res.codes }, { status: 201 });
});
