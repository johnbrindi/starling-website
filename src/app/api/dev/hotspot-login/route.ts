import { z } from "zod";
import { createHash } from "node:crypto";
import { requireCustomer } from "@/server/auth/session";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { assertSameOrigin, handler, json, readJson } from "@/server/http";
import { getNetworkAdapter } from "@/server/network";
import { FakeNetworkAdapter } from "@/server/network/fake";
import { syncSessions } from "@/server/network/sync";

/**
 * DEVELOPMENT ONLY — simulates this device logging in on the (fake) MikroTik hotspot with its code,
 * so the whole flow can be tested without hardware. The fake router enforces expiry and device limits.
 */
export const POST = handler(async (req) => {
  const e = env();
  const adapter = getNetworkAdapter();
  if (e.NODE_ENV === "production" || !(adapter instanceof FakeNetworkAdapter)) throw new AppError("NOT_FOUND", "Not found.");
  assertSameOrigin(req);
  const { customer } = await requireCustomer();
  const { code } = await readJson(req, z.object({ code: z.string().min(6).max(12) }));
  const username = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const cred = await db.accessCredential.findUnique({ where: { username } });
  if (!cred || cred.customerId !== customer.id) throw new AppError("NOT_FOUND", "Unknown code.");
  // Stable pseudo-MAC per browser so repeated clicks count as the same device.
  const ua = req.headers.get("user-agent") ?? "";
  const h = createHash("sha256").update(customer.id + ua).digest("hex");
  const mac = `02:${h.slice(0, 10).match(/../g)!.join(":")}`.toUpperCase();
  const res = await adapter.simulateLogin(username, username, mac, "10.5.50.100");
  if (res.ok) await syncSessions();
  return json(res, { status: res.ok ? 200 : 403 });
});
