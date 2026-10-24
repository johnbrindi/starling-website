import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampayProvider, verifyHs256 } from "@/server/payments/providers/campay";

const cfg = { baseUrl: "https://demo.campay.net", token: "perm-token", webhookKey: "wh-key-123" };

function jwt(claims: object, key: string, alg = "HS256") {
  const h = Buffer.from(JSON.stringify({ alg, typ: "JWT" })).toString("base64url");
  const p = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const s = createHmac("sha256", key).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}

describe("Campay provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("starts a collect with 237 + 9 digits, a string amount and our reference", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ reference: "ref-1", ussd_code: "*126#", operator: "MTN" }), { status: 200 });
    });
    const r = await new CampayProvider(cfg).initiate({ reference: "SW-20261024-ABC", amountXaf: 100, phone: "+237670000000", channel: "cm.mtn", description: "Juthelink: 1 Hour" });
    expect(r.providerReference).toBe("ref-1");
    expect(r.instructions).toMatch(/MTN MoMo/);
    expect(calls[0]!.url).toBe("https://demo.campay.net/api/collect/");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Token perm-token");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ amount: "100", currency: "XAF", from: "237670000000", description: "Juthelink: 1 Hour", external_reference: "SW-20261024-ABC" });
  });

  it("gets a 1-hour token from username/password when no permanent token is set, and reuses it", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      urls.push(url);
      if (url.endsWith("/api/token/")) return new Response(JSON.stringify({ token: "tmp", expires_in: 3600 }), { status: 200 });
      expect((init.headers as Record<string, string>).Authorization).toBe("Token tmp");
      return new Response(JSON.stringify({ reference: "r", status: "PENDING" }), { status: 200 });
    });
    const p = new CampayProvider({ baseUrl: "https://demo.campay.net", username: "u", password: "p" });
    await p.fetchStatus({ reference: "SW-1", providerReference: "r" });
    await p.fetchStatus({ reference: "SW-1", providerReference: "r" });
    expect(urls.filter((u) => u.endsWith("/api/token/"))).toHaveLength(1);
  });

  it("maps transaction status, amount (string or number) and external reference", async () => {
    for (const [raw, want, amount] of [["SUCCESSFUL", "succeeded", "100"], ["FAILED", "failed", 100], ["PENDING", "pending", 100]] as const) {
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ reference: "r1", status: raw, amount, currency: "XAF", external_reference: "SW-1" }), { status: 200 }));
      const s = await new CampayProvider(cfg).fetchStatus({ reference: "SW-1", providerReference: "r1" });
      expect(s.status).toBe(want);
      expect(s.amountXaf).toBe(100);
      expect(s.merchantReference).toBe("SW-1");
    }
  });

  it("surfaces Campay errors (e.g. invalid number) as non-retryable provider errors", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: "Invalid phone number", error_code: "ER101" }), { status: 400 }));
    await expect(new CampayProvider(cfg).initiate({ reference: "SW-1", amountXaf: 100, phone: "+237600000000", channel: "cm.mtn", description: "x" })).rejects.toMatchObject({ retryable: false, message: expect.stringMatching(/Invalid phone number/) });
  });

  it("accepts callbacks only with a JWT signed by the webhook key", () => {
    const p = new CampayProvider(cfg);
    const good = `status=SUCCESSFUL&reference=r1&amount=100&currency=XAF&external_reference=SW-1&signature=${jwt({ ok: 1 }, "wh-key-123")}`;
    const r = p.parseWebhook(good, new Headers());
    expect(r.signatureValid).toBe(true);
    expect(r.references).toEqual(["SW-1", "r1"]);
    expect(r.eventKey).toBe("r1:SUCCESSFUL");
    expect(r.payload).not.toHaveProperty("signature");

    expect(p.parseWebhook(good.replace(/signature=.*/, `signature=${jwt({ ok: 1 }, "other")}`), new Headers()).signatureValid).toBe(false);
    expect(p.parseWebhook("status=SUCCESSFUL&reference=r1", new Headers()).signatureValid).toBe(false);
    expect(new CampayProvider({ ...cfg, webhookKey: undefined }).parseWebhook(good, new Headers()).signatureValid).toBe(false);
    // JSON bodies (POST callbacks) work too
    expect(p.parseWebhook(JSON.stringify({ status: "SUCCESSFUL", reference: "r1", signature: jwt({}, "wh-key-123") }), new Headers()).signatureValid).toBe(true);
  });

  it("rejects other JWT algorithms and expired signatures", () => {
    expect(verifyHs256(jwt({}, "k", "none"), "k")).toBe(false);
    expect(verifyHs256(jwt({ exp: 1000 }, "k"), "k", 100_000)).toBe(false);
    expect(verifyHs256(jwt({ exp: 100_000 }, "k"), "k", 100_000)).toBe(true);
    expect(verifyHs256("garbage", "k")).toBe(false);
  });
});
