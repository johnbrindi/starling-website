"use client";

import { useEffect } from "react";
import { saveHotspotContext } from "@/lib/hotspot";

/** Stores the router's login URL and device details passed by the MikroTik login page redirect. */
export function PortalCapture({ loginUrl, mac, ip, plan }: { loginUrl: string | null; mac: string | null; ip: string | null; plan?: string | null }) {
  useEffect(() => {
    if (loginUrl) saveHotspotContext({ loginUrl, mac: mac ?? undefined, ip: ip ?? undefined });
    // Plan chosen on the router's login page: go straight to it.
    if (plan && /^[a-z0-9-]{2,40}$/.test(plan)) window.location.replace(`/plans/${plan}`);
  }, [loginUrl, mac, ip, plan]);
  return null;
}
