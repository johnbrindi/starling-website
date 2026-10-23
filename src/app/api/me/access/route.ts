import { requireCustomer } from "@/server/auth/session";
import { handler, json } from "@/server/http";
import { getAccessStatus } from "@/server/subscriptions/status";

/** GET /api/me/access — authoritative access status and remaining time (computed on the server). */
export const GET = handler(async () => {
  const { customer } = await requireCustomer();
  return json(await getAccessStatus(customer.id));
});
