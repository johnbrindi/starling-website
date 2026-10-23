import { handler, json } from "@/server/http";
import { listActivePackages } from "@/server/catalog";

/** GET /api/packages — purchasable packages (public). */
export const GET = handler(async () => json({ packages: await listActivePackages() }));
