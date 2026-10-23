import { db } from "@/server/db";
import { json } from "@/server/http";
import { staffRoute } from "@/server/admin/route";

/** GET /api/admin/customers?q= — search by phone, name or access code. */
export const GET = staffRoute("customers:view", async (req) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 40);
  const digits = q.replace(/\D/g, "");
  const customers = await db.customer.findMany({
    where: q
      ? {
          OR: [
            ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
            { name: { contains: q, mode: "insensitive" as const } },
            { credentials: { some: { username: q.toUpperCase().replace(/[^A-Z0-9]/g, "") } } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { payments: true, subscriptions: true } } },
  });
  return json({ customers });
});
