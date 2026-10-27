import { z } from "zod";
import { json, readJson } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { setLoginLimits } from "@/server/network/control";
import { SPEED_TIERS } from "@/server/network/commands";

const schema = z.object({
  speed: z.enum(Object.keys(SPEED_TIERS) as [keyof typeof SPEED_TIERS, ...(keyof typeof SPEED_TIERS)[]]).nullable(),
  dataLimitMb: z.number().int().min(10).max(1_000_000).nullable(),
});

/** POST /api/admin/credentials/:id/limits — speed tier (null = plan default) and data limit in MB (null = none). */
export const POST = staffRoute("customers:revoke", async (req, staff, ctx: RouteContext<"/api/admin/credentials/[id]/limits">) => {
  const { id } = await ctx.params;
  await setLoginLimits(id, await readJson(req, schema), staff.staff.id, staff.ip);
  return json({ ok: true, message: "Saved. Applied on the Wi-Fi within about 10 seconds." });
});
