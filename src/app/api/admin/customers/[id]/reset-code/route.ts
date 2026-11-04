import { json } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { issueCustomerResetCode } from "@/server/auth/customer";

/**
 * POST /api/admin/customers/:id/reset-code — one-time 6-digit code (30 min) for a customer who forgot
 * their password. Verify the caller is the account owner before reading it out.
 */
export const POST = staffRoute("customers:revoke", async (_req, staff, ctx: RouteContext<"/api/admin/customers/[id]/reset-code">) => {
  const { id } = await ctx.params;
  const code = await issueCustomerResetCode(id, staff.staff.id, staff.ip);
  return json({ result: `Reset code: ${code}\nValid 30 minutes. Give it only to the account owner. They enter it on Forgot password → By email → 6-digit code.` });
});
