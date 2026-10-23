import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { json } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { maskCode } from "@/lib/format";

/** GET /api/admin/customers/:id — profile, payments, subscriptions, credentials (codes masked), sessions. */
export const GET = staffRoute("customers:view", async (_req, _staff, ctx: RouteContext<"/api/admin/customers/[id]">) => {
  const { id } = await ctx.params;
  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      payments: { orderBy: { createdAt: "desc" }, take: 50, include: { package: { select: { name: true } } } },
      subscriptions: { orderBy: { startsAt: "desc" }, take: 50, include: { package: { select: { name: true } } } },
      credentials: { orderBy: { createdAt: "desc" }, take: 20, include: { sessions: { orderBy: { startedAt: "desc" }, take: 10 } } },
    },
  });
  if (!customer) throw new AppError("NOT_FOUND", "Customer not found.");
  const credentials = customer.credentials.map(({ passwordEnc: _p, ...c }) => ({
    ...c,
    username: maskCode(c.username),
    dataLimitBytes: c.dataLimitBytes?.toString() ?? null,
    bytesIn: c.bytesIn.toString(),
    bytesOut: c.bytesOut.toString(),
    sessions: c.sessions.map((s) => ({ ...s, bytesIn: s.bytesIn.toString(), bytesOut: s.bytesOut.toString() })),
  }));
  return json({ customer: { ...customer, credentials } });
});
