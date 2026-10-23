import { describe, expect, it } from "vitest";
import { can, ROLE_PERMISSIONS } from "@/server/auth/rbac";
import { guessOperator, normalizeCameroonPhone } from "@/lib/phone";
import { formatAccessCode, formatDuration, formatRemaining, formatXaf } from "@/lib/format";
import { decrypt, encrypt, randomCode } from "@/server/crypto";
import { buildDisconnectRequest } from "@/server/network/radius/coa";
import { NotchPayProvider } from "@/server/payments/providers/notchpay";
import { effectivePrice } from "@/server/payments/service";
import { isEntitled } from "@/server/subscriptions/service";
import { backoffMs } from "@/server/jobs/queue";
import { createHash, createHmac } from "node:crypto";

describe("RBAC", () => {
  it("is deny-by-default and only super admins manage staff", () => {
    expect(can("VIEWER", "packages:manage")).toBe(false);
    expect(can("SUPPORT", "customers:revoke")).toBe(true);
    expect(can("SUPPORT", "network:manage")).toBe(false);
    expect(can("ADMIN", "staff:manage")).toBe(false);
    expect(can("SUPER_ADMIN", "staff:manage")).toBe(true);
    expect(can("BOGUS" as never, "dashboard:view")).toBe(false);
    expect(ROLE_PERMISSIONS.VIEWER).not.toContain("settings:manage");
  });
});

describe("phone numbers", () => {
  it.each([
    ["6 70 00 00 00", "+237670000000"],
    ["+237 690000000", "+237690000000"],
    ["00237655123456", "+237655123456"],
    ["237680000000", "+237680000000"],
  ])("normalises %s", (input, out) => expect(normalizeCameroonPhone(input)).toBe(out));

  it.each(["12345", "770000000", "+33612345678", "6700000000"])("rejects %s", (input) => expect(normalizeCameroonPhone(input)).toBeNull());

  it("guesses operators", () => {
    expect(guessOperator("+237670000000")).toBe("MTN");
    expect(guessOperator("+237690000000")).toBe("ORANGE");
    expect(guessOperator("+237655000000")).toBe("ORANGE");
    expect(guessOperator("+237651000000")).toBe("MTN");
  });
});

describe("formatting", () => {
  it("formats XAF as whole francs", () => expect(formatXaf(1350).replace(/\s/g, " ")).toMatch(/^1.350 FCFA$/));
  it("formats durations", () => {
    expect(formatDuration(60)).toBe("1 hour");
    expect(formatDuration(720)).toBe("12 hours");
    expect(formatDuration(1440)).toBe("24 hours");
    expect(formatDuration(10080)).toBe("1 week");
    expect(formatDuration(20160)).toBe("2 weeks");
    expect(formatDuration(43200)).toBe("1 month");
  });
  it("formats countdowns", () => {
    expect(formatRemaining(0)).toBe("Expired");
    expect(formatRemaining(65_000)).toBe("1 min 05 s");
    expect(formatRemaining(3_725_000)).toBe("1 h 02 min");
  });
  it("formats access codes", () => expect(formatAccessCode("K7M4QX2P")).toBe("K7M4-QX2P"));
});

describe("crypto", () => {
  it("encrypts and decrypts with authentication", () => {
    const c = encrypt("K7M4QX2P");
    expect(c).not.toContain("K7M4QX2P");
    expect(decrypt(c)).toBe("K7M4QX2P");
    const tampered = c.slice(0, -2) + (c.endsWith("A") ? "BB" : "AA");
    expect(() => decrypt(tampered)).toThrow();
  });
  it("generates codes from an unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) expect(randomCode(8)).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
  });
});

describe("entitlement rule", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  const base = { status: "ACTIVE" as const, validFrom: new Date("2026-10-22T11:00:00Z"), validUntil: new Date("2026-10-22T13:00:00Z") };
  it("is true only inside the window and when ACTIVE", () => {
    expect(isEntitled(base, now)).toBe(true);
    expect(isEntitled({ ...base, validUntil: now }, now)).toBe(false);
    expect(isEntitled({ ...base, status: "REVOKED" }, now)).toBe(false);
    expect(isEntitled({ ...base, validFrom: new Date("2026-10-22T12:00:01Z") }, now)).toBe(false);
  });
});

describe("pricing", () => {
  it("applies promotions only while valid", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    expect(effectivePrice({ priceXaf: 200, promoPriceXaf: 150, promoEndsAt: new Date("2026-10-23T00:00:00Z") }, now)).toEqual({ amount: 150, promoActive: true });
    expect(effectivePrice({ priceXaf: 200, promoPriceXaf: 150, promoEndsAt: new Date("2026-10-21T00:00:00Z") }, now)).toEqual({ amount: 200, promoActive: false });
    expect(effectivePrice({ priceXaf: 200, promoPriceXaf: null, promoEndsAt: null }, now).amount).toBe(200);
  });
});

describe("job backoff", () => {
  it("grows exponentially and is capped", () => {
    expect(backoffMs(1)).toBe(15_000);
    expect(backoffMs(3)).toBe(60_000);
    expect(backoffMs(30)).toBe(30 * 60_000);
  });
});

describe("Notch Pay webhook signature", () => {
  const p = new NotchPayProvider({ baseUrl: "https://x", publicKey: "pk", webhookHash: "hsk_test_abc" });
  const body = JSON.stringify({ id: "evt_1", type: "payment.complete", data: { reference: "trx.1" } });
  it("accepts a correct HMAC-SHA256 hex signature over the raw body", () => {
    const sig = createHmac("sha256", "hsk_test_abc").update(body).digest("hex");
    const r = p.parseWebhook(body, new Headers({ "x-notch-signature": sig }));
    expect(r.signatureValid).toBe(true);
    expect(r.eventKey).toBe("evt_1");
    expect(r.references).toEqual(["trx.1"]);
  });
  it("rejects a missing or wrong signature", () => {
    expect(p.parseWebhook(body, new Headers()).signatureValid).toBe(false);
    expect(p.parseWebhook(body + " ", new Headers({ "x-notch-signature": createHmac("sha256", "hsk_test_abc").update(body).digest("hex") })).signatureValid).toBe(false);
  });
});

describe("RADIUS Disconnect-Request", () => {
  it("builds an RFC 5176 packet with a correct request authenticator", () => {
    const pkt = buildDisconnectRequest("K7M4QX2P", "secret", 7);
    expect(pkt[0]).toBe(40);
    expect(pkt[1]).toBe(7);
    expect(pkt.readUInt16BE(2)).toBe(pkt.length);
    const attrs = pkt.subarray(20);
    expect(attrs[0]).toBe(1);
    expect(attrs.subarray(2).toString()).toBe("K7M4QX2P");
    const expected = createHash("md5").update(Buffer.concat([pkt.subarray(0, 4), Buffer.alloc(16), attrs, Buffer.from("secret")])).digest();
    expect(pkt.subarray(4, 20).equals(expected)).toBe(true);
  });
});

describe("post-login redirects", async () => {
  const { safeNext } = await import("@/lib/safe-next");
  it("only allows same-site paths", () => {
    expect(safeNext("/plans/1-hour")).toBe("/plans/1-hour");
    expect(safeNext("//evil.example")).toBe("/account");
    expect(safeNext("/\\evil.example")).toBe("/account");
    expect(safeNext("https://evil.example")).toBe("/account");
    expect(safeNext(null)).toBe("/account");
  });
});
