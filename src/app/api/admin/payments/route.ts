import { db } from "@/server/db";
import { json } from "@/server/http";
import { staffRoute } from "@/server/admin/route";

const STATUSES = ["PENDING", "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED", "REFUNDED"] as const;

/** GET /api/admin/payments?status=&q= — transaction history. */
export const GET = staffRoute("payments:view", async (req) => {
  const sp = req.nextUrl.searchParams;
  const status = STATUSES.find((s) => s === sp.get("status"));
  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  const payments = await db.payment.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ reference: { contains: q.toUpperCase() } }, { payerPhone: { contains: q.replace(/\D/g, "") || q } }, { providerReference: { contains: q } }] } : {}),
    },
    include: { package: { select: { name: true } }, subscription: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return json({ payments });
});
