import { env } from "@/server/env";
import { handler, json } from "@/server/http";

/** GET /api/push/key — public VAPID key, or null when Web Push is not configured. */
export const GET = handler(async () => json({ publicKey: env().VAPID_PUBLIC_KEY ?? null }));
