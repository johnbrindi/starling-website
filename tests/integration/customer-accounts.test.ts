import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal cookie jar so session creation works outside a Next.js request.
const jar = new Map<string, { value: string; opts: Record<string, unknown> }>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)!.value } : undefined),
    set: (n: string, value: string, opts: Record<string, unknown>) => jar.set(n, { value, opts }),
    delete: (n: string) => jar.delete(n),
  }),
}));

const { db } = await import("@/server/db");
const auth = await import("@/server/auth/customer");
const { getCustomer } = await import("@/server/auth/session");
const { resetDb, resetOverrides, useFakeNetwork, makePackage, customerFor } = await import("../helpers/fixtures");

const meta = { ip: "127.0.0.1", userAgent: "vitest" };
const reg = (over: Partial<{ name: string; phone: string; password: string }> = {}) =>
  auth.registerSchema.parse({ name: "Marie Ngono", phone: "6 70 11 22 33", password: "strong-pass-1", ...over });

describe("customer accounts", () => {
  beforeEach(async () => {
    resetOverrides();
    await resetDb();
    useFakeNetwork();
    jar.clear();
  });

  it("registers with name, phone and password, stores only a hash, and signs in", async () => {
    const c = await auth.registerCustomer(reg(), meta);
    expect(c.phone).toBe("+237670112233");
    expect(c.name).toBe("Marie Ngono");
    expect(c.passwordHash).toMatch(/^\$argon2id\$/);
    expect(c.passwordHash).not.toContain("strong-pass-1");
    expect((await getCustomer())?.customer.id).toBe(c.id);
    const cookie = [...jar.values()][0]!;
    expect(cookie.opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("validates input", () => {
    expect(() => reg({ name: "A" })).toThrow(/full name/);
    expect(() => reg({ phone: "12345" })).toThrow(/Cameroon mobile number/);
    expect(() => reg({ password: "short" })).toThrow(/8 characters/);
  });

  it("refuses a second account for the same number", async () => {
    await auth.registerCustomer(reg(), meta);
    await expect(auth.registerCustomer(reg({ name: "Someone Else" }), meta)).rejects.toThrow(/already exists/);
  });

  it("a number with earlier purchases cannot be claimed by registering; it needs proof", async () => {
    await db.customer.create({ data: { phone: "+237670112233" } });
    await expect(auth.registerCustomer(reg(), meta)).rejects.toThrow(/already has purchases/);
  });

  it("signs in with phone + password and locks after 5 wrong passwords", async () => {
    await auth.registerCustomer(reg(), meta);
    jar.clear();
    const login = (password: string) => auth.loginCustomer(auth.loginSchema.parse({ phone: "670112233", password }), meta);
    await expect(login("wrong-password")).rejects.toThrow(/Wrong phone number or password/);
    expect((await login("strong-pass-1")).name).toBe("Marie Ngono");
    for (let i = 0; i < 5; i++) await expect(login("wrong-password")).rejects.toThrow();
    await expect(login("strong-pass-1")).rejects.toThrow(/Too many wrong passwords/);
  });

  it("does not reveal whether an unknown number exists", async () => {
    await expect(auth.loginCustomer(auth.loginSchema.parse({ phone: "699999999", password: "anything-1" }), meta)).rejects.toThrow(/Wrong phone number or password/);
  });

  it("resets the password with any access code issued to that customer, and only theirs", async () => {
    const { createCheckout, verifyPayment } = await import("@/server/payments/service");
    const owner = await customerFor("670000000");
    const other = await auth.registerCustomer(reg({ phone: "690000000" }), meta);
    const pkg = await makePackage();
    const { payment } = await createCheckout(owner.id, { packageId: pkg.id, phone: "670000000", channel: "cm.mtn", idempotencyKey: crypto.randomUUID() });
    await verifyPayment(payment.id);
    const code = (await db.accessCredential.findFirstOrThrow({ where: { customerId: owner.id } })).username;

    // Someone else's code is not proof for this number.
    await expect(auth.resetCustomerPassword(auth.resetSchema.parse({ phone: "690000000", proof: code, password: "new-pass-123" }), meta)).rejects.toThrow(/do not match/);
    await auth.resetCustomerPassword(auth.resetSchema.parse({ phone: "670000000", proof: `${code.slice(0, 4)}-${code.slice(4)}`, password: "new-pass-123" }), meta);
    jar.clear();
    expect((await auth.loginCustomer(auth.loginSchema.parse({ phone: "670000000", password: "new-pass-123" }), meta)).id).toBe(owner.id);
    expect(other.id).not.toBe(owner.id);
  });

  it("support reset codes work once and expire", async () => {
    const c = await auth.registerCustomer(reg(), meta);
    const staff = await db.staffUser.create({ data: { email: "s@x.cm", name: "S", passwordHash: "x", role: "SUPPORT" } });
    const code = await auth.issueCustomerResetCode(c.id, staff.id);
    expect(code).toMatch(/^\d{6}$/);
    expect((await db.customer.findUniqueOrThrow({ where: { id: c.id } })).resetCodeHash).not.toContain(code);
    const input = auth.resetSchema.parse({ phone: "670112233", proof: code, password: "brand-new-pass" });
    await auth.resetCustomerPassword(input, meta);
    await expect(auth.resetCustomerPassword(input, meta)).rejects.toThrow(/do not match/); // single use
    const code2 = await auth.issueCustomerResetCode(c.id, staff.id);
    await db.customer.update({ where: { id: c.id }, data: { resetCodeExpiresAt: new Date(Date.now() - 1000) } });
    await expect(auth.resetCustomerPassword(auth.resetSchema.parse({ phone: "670112233", proof: code2, password: "another-pass-1" }), meta)).rejects.toThrow();
  });

  it("changing the password requires the current one and signs out other devices", async () => {
    const c = await auth.registerCustomer(reg(), meta);
    const s1 = (await getCustomer())!.sessionId;
    await db.session.create({ data: { tokenHash: "other-device", kind: "CUSTOMER", customerId: c.id, csrfToken: "x", expiresAt: new Date(Date.now() + 1e6) } });
    await expect(auth.changeCustomerPassword(c.id, { current: "nope", password: "next-pass-123" }, s1, "ip")).rejects.toThrow(/not correct/);
    await auth.changeCustomerPassword(c.id, { current: "strong-pass-1", password: "next-pass-123" }, s1, "ip");
    expect(await db.session.count({ where: { customerId: c.id } })).toBe(1);
  });
});
