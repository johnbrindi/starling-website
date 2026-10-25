import { after } from "next/server";
import { requireCustomer } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { assertSameOrigin, clientIp, handler, json, readJson } from "@/server/http";
import { claimManualPayment, claimSchema, MAX_PROOF_BYTES } from "@/server/payments/service";
import { toPaymentDto } from "@/server/payments/dto";
import { notifyStaffOfClaim } from "@/server/notifications/staff";
import { rateLimit } from "@/server/rate-limit";

/**
 * POST /api/payments/:id/claim — the customer proves a manual MoMo payment: JSON { transactionId }
 * or multipart form (transactionId?, screenshot?). Staff are notified; they still confirm it
 * against their MoMo SMS before any access is granted.
 */
export const POST = handler(async (req, ctx: RouteContext<"/api/payments/[id]/claim">) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const { customer } = await requireCustomer();
  await rateLimit(`claim:ip:${clientIp(req)}`, 20, 600);
  await rateLimit(`claim:customer:${customer.id}`, 10, 600);

  let transactionId: string | undefined;
  let screenshot: Uint8Array | undefined;
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_PROOF_BYTES + 100_000) throw new AppError("VALIDATION_FAILED", "The screenshot is too large (max 2 MB).");
    const form = await req.formData();
    const parsed = claimSchema.safeParse({ transactionId: form.get("transactionId") ?? undefined });
    if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid Transaction ID.", [{ path: "transactionId", message: parsed.error.issues[0]?.message ?? "Invalid." }]);
    transactionId = parsed.data.transactionId;
    const file = form.get("screenshot");
    if (file instanceof File && file.size > 0) screenshot = new Uint8Array(await file.arrayBuffer());
  } else {
    transactionId = (await readJson(req, claimSchema)).transactionId;
  }
  const payment = await claimManualPayment(customer.id, id, { transactionId, screenshot });
  after(() => notifyStaffOfClaim(payment.id));
  return json({ payment: toPaymentDto(payment) });
});
