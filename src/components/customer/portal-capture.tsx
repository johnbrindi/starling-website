"use client";

import { useEffect } from "react";
import { saveHotspotContext } from "@/lib/hotspot";

/** Stores the router's login URL and device details passed by the MikroTik login page redirect. */
export function PortalCapture({ loginUrl, mac, ip }: { loginUrl: string | null; mac: string | null; ip: string | null }) {
  useEffect(() => {
    if (loginUrl) saveHotspotContext({ loginUrl, mac: mac ?? undefined, ip: ip ?? undefined });
  }, [loginUrl, mac, ip]);
  return null;
}
