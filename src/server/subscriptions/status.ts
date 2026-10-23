import "server-only";
import type { AccessState, AccessStatusDto } from "@/lib/types";
import { db } from "../db";
import { env } from "../env";
import { getSettings } from "../settings";
import { credentialPassword, isEntitled } from "./service";

/**
 * The customer's current access, computed on the server from database timestamps.
 * The client renders a countdown from serverTime/validUntil but never decides access.
 */
export async function getAccessStatus(customerId: string): Promise<AccessStatusDto> {
  const now = new Date();
  const settings = await getSettings();
  // Prefer the credential that is entitled now, else the most recent one.
  const credential =
    (await db.accessCredential.findFirst({
      where: { customerId, status: "ACTIVE", validUntil: { gt: now } },
      orderBy: { validUntil: "desc" },
    })) ?? (await db.accessCredential.findFirst({ where: { customerId }, orderBy: { createdAt: "desc" } }));

  let state: AccessState = "NONE";
  let sessions: { macAddress: string | null; ipAddress: string | null; startedAt: Date }[] = [];
  if (credential) {
    if (credential.status === "REVOKED") state = "REVOKED";
    else if (!isEntitled(credential, now)) state = credential.validFrom > now ? "SCHEDULED" : "EXPIRED";
    else if (credential.provisionState !== "PROVISIONED") state = "PROVISIONING";
    else {
      sessions = await db.networkSession.findMany({
        where: { credentialId: credential.id, endedAt: null },
        select: { macAddress: true, ipAddress: true, startedAt: true },
      });
      state = sessions.length > 0 ? "ONLINE" : "READY";
    }
  }
  const showCode = credential && credential.status !== "REVOKED";
  const password = showCode ? credentialPassword(credential) : "";
  return {
    serverTime: now.toISOString(),
    state,
    credential: credential
      ? {
          username: showCode ? credential.username : "",
          password,
          style: credential.username === password ? "code" : "userpass",
          validFrom: credential.validFrom.toISOString(),
          validUntil: credential.validUntil.toISOString(),
          status: credential.status,
          provisionState: credential.provisionState,
          maxDevices: credential.maxDevices,
          dataLimitBytes: credential.dataLimitBytes?.toString() ?? null,
          bytesUsed: (credential.bytesIn + credential.bytesOut).toString(),
        }
      : null,
    activeSessions: sessions.map((s) => ({ macAddress: s.macAddress, ipAddress: s.ipAddress, startedAt: s.startedAt.toISOString() })),
    warningMinutes: settings.warningMinutes,
    hotspotLoginUrl: env().HOTSPOT_LOGIN_URL,
  };
}
