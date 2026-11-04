import { expect, test, type Page } from "@playwright/test";
import { MAILPIT_API } from "./env";
import { warmUp } from "./warmup";

/** Waits for the newest email to `to` in the local test mailbox and returns the 6-digit code. */
async function codeFromEmail(to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const list = (await (await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json()) as { messages: { ID: string }[] };
    if (list.messages?.length) {
      const msg = (await (await fetch(`${MAILPIT_API}/message/${list.messages[0]!.ID}`)).json()) as { Text: string; Subject: string };
      const m = msg.Text.match(/\b(\d{6})\b/);
      if (m) return m[1]!;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No reset email for ${to}`);
}

async function ready(page: Page) {
  await page.locator('form button[type="submit"]:not([disabled])').first().waitFor();
}

async function signOut(page: Page) {
  await page.goto("/account/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/account"));
}

test.describe("accounts: sign-up and password recovery", () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(600_000);
    await warmUp(browser, ["/register", "/login", "/forgot-password", "/account", "/account/email", "/account/settings", "/admin/login", "/admin/customers"]);
  });
  test.beforeEach(() => test.setTimeout(180_000));

  test("sign-up needs email and matching passwords; forgot password by email works end to end", async ({ page }) => {
    const phone = "6770" + String(Date.now()).slice(-5);
    const email = `client${phone}@example.com`;
    await page.goto("/register");
    await ready(page);
    await page.getByLabel("Full name").fill("Aline Test");
    await page.getByLabel("Phone number").fill(phone);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Create a password").fill("first-pass-123");
    await page.getByLabel("Confirm password").fill("first-pass-999");
    await page.getByText("I accept the").click();
    await expect(page.getByText("Not the same as the password.")).toBeVisible();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("The two passwords are not the same.")).toBeVisible();
    await page.getByLabel("Confirm password").fill("first-pass-123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Hi, Aline" })).toBeVisible();
    await expect(page.getByText("Add your email")).toHaveCount(0);

    await signOut(page);
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await ready(page);
    await page.getByLabel("Phone number or email").fill(phone);
    await page.getByRole("button", { name: "Send me a code by email" }).click();
    await expect(page.getByText(/We sent a 6-digit code to c\*+\d@example\.com/)).toBeVisible();
    const code = await codeFromEmail(email);
    await page.getByLabel("6-digit code").fill(code);
    await page.getByLabel("New password", { exact: true }).fill("second-pass-456");
    await page.getByLabel("Confirm new password").fill("second-pass-456");
    await page.getByRole("button", { name: /Set new password/ }).click();
    await expect(page.getByRole("heading", { name: "Hi, Aline" })).toBeVisible();

    // The new password works; the old one does not.
    await signOut(page);
    await page.goto("/login");
    await ready(page);
    await page.getByLabel("Phone number").fill(phone);
    await page.getByLabel("Password", { exact: true }).fill("first-pass-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Wrong phone number or password.")).toBeVisible();
    await page.getByLabel("Password", { exact: true }).fill("second-pass-456");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Hi, Aline" })).toBeVisible();
  });

  test("an older account without email is asked for one right after signing in", async ({ page }) => {
    await page.goto("/login?next=/account");
    await ready(page);
    await page.getByLabel("Phone number").fill("670000091"); // legacy customer, created without email
    await page.getByLabel("Password", { exact: true }).fill("legacy-customer-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Add your email" })).toBeVisible();
    await page.getByLabel("Email").fill("Legacy.Customer@Example.com");
    await page.getByRole("button", { name: "Save email" }).click();
    await expect(page.getByRole("heading", { name: "Hi, Legacy" })).toBeVisible();
    await expect(page.getByText("Add your email")).toHaveCount(0);
    // From now on that email receives reset codes.
    await signOut(page);
    await page.goto("/forgot-password");
    await ready(page);
    await page.getByLabel("Phone number or email").fill("legacy.customer@example.com");
    await page.getByRole("button", { name: "Send me a code by email" }).click();
    await expect(page.getByText(/We sent a 6-digit code to l\*+r@example\.com/)).toBeVisible();
    expect(await codeFromEmail("legacy.customer@example.com")).toMatch(/^\d{6}$/);
  });

  test("a code from Juthelink support (admin) resets the password", async ({ browser }) => {
    // Customer without email (legacy) asks support on WhatsApp; admin issues a code.
    const admin = await (await browser.newContext()).newPage();
    await admin.goto("/admin/login");
    await ready(admin);
    await admin.getByLabel("Email").fill("admin@starling.local");
    await admin.getByLabel("Password").fill("starling-dev-admin-1");
    await admin.getByRole("button", { name: /Sign in/ }).click();
    await admin.waitForURL((u) => u.pathname === "/admin");
    await admin.goto("/admin/customers?q=670000091");
    await admin.getByRole("link", { name: /6 70 00 00 91/ }).first().click();
    admin.on("dialog", (d) => d.accept());
    await admin.getByRole("button", { name: "Password reset code" }).click();
    const text = await admin.getByText(/Reset code: \d{6}/).innerText();
    const code = text.match(/(\d{6})/)![1]!;

    const page = await (await browser.newContext()).newPage();
    await page.goto("/forgot-password");
    await ready(page);
    await page.getByRole("button", { name: "Ask us" }).click();
    await expect(page.getByRole("link", { name: "WhatsApp Juthelink" })).toHaveAttribute("href", /^whatsapp:\/\/send\?phone=\d+/);
    await page.getByRole("button", { name: "I have a code" }).click();
    await page.getByLabel("Phone number or email").fill("670000091");
    await page.getByLabel("6-digit code").fill(code);
    await page.getByLabel("New password", { exact: true }).fill("support-pass-789");
    await page.getByLabel("Confirm new password").fill("support-pass-789");
    await page.getByRole("button", { name: /Set new password/ }).click();
    await expect(page.getByRole("heading", { name: /Hi, Legacy|Add your email/ })).toBeVisible();
  });
});
