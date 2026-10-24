import { afterEach, describe, expect, it, vi } from "vitest";
import { FapshiProvider } from "@/server/payments/providers/fapshi";

const cfg = { baseUrl: "https://sandbox.fapshi.com", apiUser: "user-1", apiKey: "FAK_TEST_x", webhookSecret: "wh-secret-123" };

describe("Fapshi provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("starts a direct pay with a 9-digit phone, the right medium and our reference", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ message: "Accepted", transId: "aMla0gA853" }), { status: 200 });
    });
    const p = new FapshiProvider(cfg);
    const r = await p.initiate({ reference: "SW-20261024-ABC", amountXaf: 100, phone: "+237670000000", channel: "cm.mtn", description: "Juthelink: 1 Hour" });
    expect(r.providerReference).toBe("aMla0gA853");
    expect(calls[0]!.url).toBe("https://sandbox.fapshi.com/direct-pay");
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h.apiuser).toBe("user-1");
    expect(h.apikey).toBe("FAK_TEST_x");
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ amount: 100, phone: "670000000", medium: "mobile money", externalId: "SW-20261024-ABC" });
  });

  it("maps payment-status values", async () => {
    for (const [raw, want] of [["SUCCESSFUL", "succeeded"], ["FAILED", "failed"], ["EXPIRED", "expired"], ["PENDING", "pending"], ["CREATED", "pending"]] as const) {
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ transId: "t1", status: raw, amount: 100, externalId: "SW-1" }), { status: 200 }));
      const s = await new FapshiProvider(cfg).fetchStatus({ reference: "SW-1", providerReference: "t1" });
      expect(s.status).toBe(want);
      expect(s.amountXaf).toBe(100);
      expect(s.merchantReference).toBe("SW-1");
    }
  });

  it("surfaces Fapshi errors as provider errors", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: "invalid phone" }), { status: 400 }));
    await expect(new FapshiProvider(cfg).initiate({ reference: "SW-1", amountXaf: 100, phone: "+237670000000", channel: "cm.orange", description: "x" })).rejects.toThrow(/invalid phone/);
  });

  it("accepts webhooks only with the right x-wh-secret", () => {
    const p = new FapshiProvider(cfg);
    const body = JSON.stringify({ transId: "t1", status: "SUCCESSFUL", externalId: "SW-1" });
    expect(p.parseWebhook(body, new Headers({ "x-wh-secret": "wh-secret-123" }))).toMatchObject({ signatureValid: true, eventKey: "t1:SUCCESSFUL", references: ["SW-1", "t1"] });
    expect(p.parseWebhook(body, new Headers({ "x-wh-secret": "nope" })).signatureValid).toBe(false);
    expect(p.parseWebhook(body, new Headers()).signatureValid).toBe(false);
    expect(new FapshiProvider({ ...cfg, webhookSecret: undefined }).parseWebhook(body, new Headers({ "x-wh-secret": "" })).signatureValid).toBe(false);
  });
});
