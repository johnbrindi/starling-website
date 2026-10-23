import { env } from "@/server/env";
import { json } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { createPasswordReset } from "@/server/auth/staff";

/** POST /api/admin/staff/:id/reset-link — single-use 1-hour reset link to hand over securely. */
export const POST = staffRoute("staff:manage", async (_req, staff, ctx: RouteContext<"/api/admin/staff/[id]/reset-link">) => {
  const { id } = await ctx.params;
  const token = await createPasswordReset(id, staff.staff.id);
  return json({ url: `${env().APP_URL}/admin/reset?token=${token}` });
});
