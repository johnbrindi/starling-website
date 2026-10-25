import { staffRoute } from "@/server/admin/route";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";

/** GET /api/admin/payments/:id/proof — the customer's payment screenshot (staff only, never cached). */
export const GET = staffRoute("payments:view", async (_req, _staff, ctx: RouteContext<"/api/admin/payments/[id]/proof">) => {
  const { id } = await ctx.params;
  const proof = await db.paymentProof.findUnique({ where: { paymentId: id } });
  if (!proof) throw new AppError("NOT_FOUND", "No screenshot for this payment.");
  return new Response(new Uint8Array(proof.data), {
    headers: {
      "Content-Type": proof.mimeType,
      "Content-Length": String(proof.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "Content-Disposition": "inline",
    },
  });
});
