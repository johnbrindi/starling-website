import { json, readJson } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { cashSaleSchema, createCashSale } from "@/server/sales";
import { provisionNow } from "@/server/jobs/tick";

/**
 * POST /api/admin/sales — counter (cash) sale. Body: { packageId, phone, name?, style: "userpass"|"code", idempotencyKey }.
 * Returns the Wi-Fi login to hand to the customer (shown once; also visible to them in their account).
 */
export const POST = staffRoute("sales:create", async (req, staff) => {
  const sale = await createCashSale(await readJson(req, cashSaleSchema), staff.staff.id, staff.ip);
  await provisionNow(sale.customerId);
  return json({ sale }, { status: 201 });
});
