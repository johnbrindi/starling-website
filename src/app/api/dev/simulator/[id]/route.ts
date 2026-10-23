import { z } from "zod";
import { requireCustomer } from "@/server/auth/session";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { assertSameOrigin, handler, json, readJson } from "@/server/http";
import { simulatorDecide } from "@/server/payments/service";
import { provisionNow } from "@/server/jobs/tick";

/** DEVELOPMENT ONLY — approve/decline a simulated payment. Returns 404 when the simulator is off. */
export const POST = handler(async (req, ctx: RouteContext<"/api/dev/simulator/[id]">) => {
  const e = env();
  if (e.NODE_ENV === "production" || !e.ALLOW_SIMULATED_PAYMENTS) throw new AppError("NOT_FOUND", "Not found.");
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const { customer } = await requireCustomer();
  const p = await db.payment.findUnique({ where: { id } });
  if (!p || p.customerId !== customer.id) throw new AppError("NOT_FOUND", "Payment not found.");
  const { decision } = await readJson(req, z.object({ decision: z.enum(["succeeded", "failed", "cancelled"]) }));
  const updated = await simulatorDecide(id, decision);
  if (updated.status === "SUCCEEDED") await provisionNow(customer.id);
  return json({ status: updated.status });
});
