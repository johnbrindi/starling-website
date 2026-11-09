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
const { hashPassword } = await import("@/server/auth/password");
const { resetDb, resetOverrides, useFakeNetwork } = await import("../helpers/fixtures");

const meta = { ip: "127.0.0.1", userAgent: "vitest" };
const reg = (over: Partial<{ name: string; email: string; password: string; confirmPassword: string }> = {}) =>
  auth.registerSchema.parse({ name: "Marie Ngono", email: "Marie@Mail.test", password: "strong-pass-1", confirmPassword: over.password ?? "strong-pass-1", ...over });
const login = (identifier: string, password: string) => auth.loginCustomer(auth.loginSchema.parse({ identifier, password }), meta);
const reset = async (identifier: string, code: string, password: string, confirmPassword = password) =>
  auth.resetCustomerPassword(auth.resetSchema.parse({ identifier, code, password, confirmPassword }), meta);
const request = (identifier: string) => auth.requestPasswordResetCode(auth.resetRequestSchema.parse({ identifier }), meta);
const lastCode = () => mails.at(-1)!.text.match(/\b(\d{6})\b/)![1]!;

/** An account created before emails were used: phone + password, no email. */
async function olderAccount(phone = "+237670000090", password = "older-pass-1") {
  return db.customer.create({ data: { phone, name: "Older Client", passwordHash: await hashPassword(password), passwordChangedAt: new Date() } });
}

describe("customer accounts (email sign-in, email code recovery)", () => {
  beforeEach(async () => {
    resetOverrides();
    await resetDb();
    useFakeNetwork();
    jar.clear();
    mails.length = 0;
  });

  it("signs up with name, email and password only (no phone), and signs in", async () => {
    const c = await auth.registerCustomer(reg(), meta);
    expect(c.email).toBe("marie@mail.test");
    expect(c.phone).toBeNull();
    expect(c.passwordHash).toMatch(/^\$argon2id\$/);
    expect((await getCustomer())?.customer.id).toBe(c.id);
  });

  it("validates sign-up input", () => {
    expect(() => reg({ name: "A" })).toThrow(/full name/);
    expect(() => reg({ email: "not-an-email" })).toThrow(/valid email/);
    expect(() => reg({ password: "short" })).toThrow(/8 characters/);
    expect(() => reg({ password: "strong-pass-1", confirmPassword: "strong-pass-2" })).toThrow(/not the same/);
  });

  it("one account per email (any capitalisation)", async () => {
    await auth.registerCustomer(reg(), meta);
    await expect(auth.registerCustomer(reg({ name: "Someone Else", email: "MARIE@mail.test" }), meta)).rejects.toThrow(/already exists for this email/);
  });

  it("signs in with email + password and locks after 5 wrong passwords", async () => {
    const c = await auth.registerCustomer(reg(), meta);
    jar.clear();
    expect((await login("MARIE@MAIL.TEST", "strong-pass-1")).id).toBe(c.id);
    for (let i = 0; i < 5; i++) await expect(login("marie@mail.test", "wrong-pass-1")).rejects.toThrow(/Wrong email or password/);
    await expect(login("marie@mail.test", "strong-pass-1")).rejects.toThrow(/Too many wrong passwords/);
  });

  it("older accounts still sign in with their phone number, then with the email they add", async () => {
    const c = await olderAccount();
    expect((await login("6 70 00 00 90", "older-pass-1")).id).toBe(c.id);
    await auth.setCustomerEmail(c.id, "older@mail.test", "ip");
    jar.clear();
    expect((await login("older@mail.test", "older-pass-1")).id).toBe(c.id);
  });

  it("forgot password: the 6-digit code goes to the account email and works once", async () => {
    const c = await auth.registerCustomer(reg(), meta);
    expect(await request("Marie@Mail.test")).toEqual({ sent: true, to: "m***e@mail.test" });
    expect(mails[0]!.to).toBe("marie@mail.test");
    const code = lastCode();
    await expect(reset("marie@mail.test", code, "brand-new-pass", "brand-new-pasz")).rejects.toThrow(/not the same/);
    await reset("marie@mail.test", code, "brand-new-pass");
    jar.clear();
    expect((await login("marie@mail.test", "brand-new-pass")).id).toBe(c.id);
    await expect(reset("marie@mail.test", code, "another-pass-1")).rejects.toThrow(/not correct or has expired/);
  });

  it("says plainly when there is no account, or when an older account has no email", async () => {
    expect(await request("nobody@mail.test")).toEqual({ sent: false, reason: "not-found" });
    await olderAccount();
    expect(await request("670000090")).toEqual({ sent: false, reason: "no-email" });
    expect(mails).toHaveLength(0);
  });

  it("five wrong codes cancel the code", async () => {
    await auth.registerCustomer(reg(), meta);
    await request("marie@mail.test");
    const code = lastCode();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) await expect(reset("marie@mail.test", wrong, "x-pass-1234")).rejects.toThrow(/not correct/);
    await expect(reset("marie@mail.test", wrong, "x-pass-1234")).rejects.toThrow(/Too many wrong codes/);
    await expect(reset("marie@mail.test", code, "x-pass-1234")).rejects.toThrow();
  });

  it("an older account without email resets with a code from Juthelink (admin), once", async () => {
    const c = await olderAccount();
    const staff = await db.staffUser.create({ data: { email: "s@x.cm", name: "S", passwordHash: "x", role: "SUPPORT" } });
    const code = await auth.issueCustomerResetCode(c.id, staff.id);
    await reset("670000090", code, "brand-new-pass");
    jar.clear();
    expect((await login("670000090", "brand-new-pass")).id).toBe(c.id);
    await expect(reset("670000090", code, "another-pass-1")).rejects.toThrow();
  });
});
