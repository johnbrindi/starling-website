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

// Capture outgoing emails instead of sending them.
const mails: { to: string; subject: string; text: string }[] = [];
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: async (m: { to: string; subject: string; text: string }) => { mails.push(m); return { messageId: "x" }; } }) },
}));
process.env.SMTP_HOST = "smtp.test";
process.env.SMTP_USER = "sender@test.local";
process.env.SMTP_PASS = "secret";

const { db } = await import("@/server/db");
const auth = await import("@/server/auth/customer");
const { getCustomer } = await import("@/server/auth/session");
const { resetDb, resetOverrides, useFakeNetwork, makePackage, customerFor } = await import("../helpers/fixtures");

const meta = { ip: "127.0.0.1", userAgent: "vitest" };
const reg = (over: Partial<{ name: string; phone: string; email: string; password: string; confirmPassword: string }> = {}) =>
  auth.registerSchema.parse({
    name: "Marie Ngono",
    phone: "6 70 11 22 33",
    email: `m${(over.phone ?? "670112233").replace(/\D/g, "")}@Mail.test`,
    password: "strong-pass-1",
    confirmPassword: over.password ?? "strong-pass-1",
    ...over,
  });

describe("customer accounts", () => {
  beforeEach(async () => {
    resetOverrides();
    await resetDb();
    useFakeNetwork();
    jar.clear();
    mails.length = 0;
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

  it("refuses sign-up and reset when the two passwords are not the same", async () => {
    expect(() => reg({ password: "strong-pass-1", confirmPassword: "strong-pass-2" })).toThrow(/not the same/);
    expect(() => auth.resetSchema.parse({ method: "code", identifier: "670112233", code: "123456", password: "abc-12345", confirmPassword: "abc-12346" })).toThrow(/not the same/);
  });

  it("stores the email in lower case and refuses an email used by another account", async () => {
    const c = await auth.registerCustomer(reg(), meta);
    expect(c.email).toBe("m670112233@mail.test");
    await expect(auth.registerCustomer(reg({ phone: "690000000", email: "M670112233@mail.test" }), meta)).rejects.toThrow(/email is already used/);
  });

  it("forgot password by email: code sent to the account's email (by phone or email), works once", async () => {
    const c = await auth.registerCustomer(reg(), meta);
    const r = await auth.requestPasswordResetCode(auth.resetRequestSchema.parse({ identifier: "6 70 11 22 33" }), meta);
    expect(r).toEqual({ sent: true, to: "m*****3@mail.test" });
    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toBe("m670112233@mail.test");
    const code = mails[0]!.text.match(/\b(\d{6})\b/)![1]!;
    expect((await db.customer.findUniqueOrThrow({ where: { id: c.id } })).resetCodeHash).not.toContain(code);
    const input = auth.resetSchema.parse({ method: "code", identifier: "M670112233@mail.test", code, password: "brand-new-pass", confirmPassword: "brand-new-pass" });
    await auth.resetCustomerPassword(input, meta);
    jar.clear();
    expect((await auth.loginCustomer(auth.loginSchema.parse({ phone: "670112233", password: "brand-new-pass" }), meta)).id).toBe(c.id);
    await expect(auth.resetCustomerPassword(input, meta)).rejects.toThrow(/not correct or has expired/); // single use
  });

  it("tells the customer when there is no account or no email, so they use another way", async () => {
    expect(await auth.requestPasswordResetCode(auth.resetRequestSchema.parse({ identifier: "699999999" }), meta)).toEqual({ sent: false, reason: "not-found" });
    await customerFor("670000005"); // legacy customer without email
    expect(await auth.requestPasswordResetCode(auth.resetRequestSchema.parse({ identifier: "670000005" }), meta)).toEqual({ sent: false, reason: "no-email" });
    expect(mails).toHaveLength(0);
  });

  it("five wrong codes cancel the code", async () => {
    const c = await auth.registerCustomer(reg(), meta);
    await auth.requestPasswordResetCode(auth.resetRequestSchema.parse({ identifier: "670112233" }), meta);
    const code = mails[0]!.text.match(/\b(\d{6})\b/)![1]!;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) {
      await expect(auth.resetCustomerPassword(auth.resetSchema.parse({ method: "code", identifier: "670112233", code: wrong, password: "x-pass-1234", confirmPassword: "x-pass-1234" }), meta)).rejects.toThrow(/not correct/);
    }
    await expect(auth.resetCustomerPassword(auth.resetSchema.parse({ method: "code", identifier: "670112233", code: wrong, password: "x-pass-1234", confirmPassword: "x-pass-1234" }), meta)).rejects.toThrow(/Too many wrong codes/);
    await expect(auth.resetCustomerPassword(auth.resetSchema.parse({ method: "code", identifier: "670112233", code, password: "x-pass-1234", confirmPassword: "x-pass-1234" }), meta)).rejects.toThrow(); // even the right code is now dead
    expect((await db.customer.findUniqueOrThrow({ where: { id: c.id } })).resetCodeHash).toBeNull();
  });

  it("resets with the username AND password of a Wi-Fi login on this account, never someone else's", async () => {
    const { createCheckout, verifyPayment } = await import("@/server/payments/service");
    const { credentialPassword } = await import("@/server/subscriptions/service");
    const owner = await customerFor("670000000");
    await auth.registerCustomer(reg({ phone: "690000000" }), meta);
    const pkg = await makePackage();
    const { payment } = await createCheckout(owner.id, { packageId: pkg.id, phone: "670000000", channel: "cm.mtn", idempotencyKey: crypto.randomUUID() });
    await verifyPayment(payment.id);
    const cred = await db.accessCredential.findFirstOrThrow({ where: { customerId: owner.id } });
    const wifi = { wifiUsername: cred.username, wifiPassword: credentialPassword(cred) };

    await expect(auth.resetCustomerPassword(auth.resetSchema.parse({ method: "wifi", identifier: "690000000", ...wifi, password: "new-pass-123", confirmPassword: "new-pass-123" }), meta)).rejects.toThrow(/do not match/);
    await expect(auth.resetCustomerPassword(auth.resetSchema.parse({ method: "wifi", identifier: "670000000", wifiUsername: cred.username, wifiPassword: "999999x", password: "new-pass-123", confirmPassword: "new-pass-123" }), meta)).rejects.toThrow(/do not match/);
    await auth.resetCustomerPassword(auth.resetSchema.parse({ method: "wifi", identifier: "670000000", ...wifi, password: "new-pass-123", confirmPassword: "new-pass-123" }), meta);
    jar.clear();
    expect((await auth.loginCustomer(auth.loginSchema.parse({ phone: "670000000", password: "new-pass-123" }), meta)).id).toBe(owner.id);
  });

  it("support reset codes work once and expire", async () => {
    const c = await auth.registerCustomer(reg(), meta);
    const staff = await db.staffUser.create({ data: { email: "s@x.cm", name: "S", passwordHash: "x", role: "SUPPORT" } });
    const code = await auth.issueCustomerResetCode(c.id, staff.id);
    expect(code).toMatch(/^\d{6}$/);
    const input = auth.resetSchema.parse({ method: "code", identifier: "670112233", code, password: "brand-new-pass", confirmPassword: "brand-new-pass" });
    await auth.resetCustomerPassword(input, meta);
    await expect(auth.resetCustomerPassword(input, meta)).rejects.toThrow(); // single use
    const code2 = await auth.issueCustomerResetCode(c.id, staff.id);
    await db.customer.update({ where: { id: c.id }, data: { resetCodeExpiresAt: new Date(Date.now() - 1000) } });
    await expect(auth.resetCustomerPassword(auth.resetSchema.parse({ method: "code", identifier: "670112233", code: code2, password: "another-pass-1", confirmPassword: "another-pass-1" }), meta)).rejects.toThrow();
  });

  it("changing the password requires the current one and signs out other devices", async () => {
    const c = await auth.registerCustomer(reg(), meta);
    const s1 = (await getCustomer())!.sessionId;
    await db.session.create({ data: { tokenHash: "other-device", kind: "CUSTOMER", customerId: c.id, csrfToken: "x", expiresAt: new Date(Date.now() + 1e6) } });
    await expect(auth.changeCustomerPassword(c.id, { current: "nope", password: "next-pass-123", confirmPassword: "next-pass-123" }, s1, "ip")).rejects.toThrow(/not correct/);
    await auth.changeCustomerPassword(c.id, { current: "strong-pass-1", password: "next-pass-123", confirmPassword: "next-pass-123" }, s1, "ip");
    expect(await db.session.count({ where: { customerId: c.id } })).toBe(1);
  });
});
