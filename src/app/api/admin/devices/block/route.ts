import { z } from "zod";
import { json, readJson } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { blockDevice } from "@/server/network/control";

/** POST /api/admin/devices/block — block a device by MAC. Body: { mac, reason? }. */
export const POST = staffRoute("customers:revoke", async (req, staff) => {
  const { mac, reason } = await readJson(req, z.object({ mac: z.string().min(11).max(20), reason: z.string().trim().max(200).optional() }));
  await blockDevice(mac, reason ?? null, staff.staff.id, staff.ip);
  return json({ ok: true, message: "Device blocked. It is disconnected within about 10 seconds." });
});
