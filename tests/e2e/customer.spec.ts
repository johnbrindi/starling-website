import { expect, test, type Page } from "@playwright/test";

async function register(page: Page, name: string, phone: string, password = "e2e-password-1") {
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Create a password").fill(password);
  await page.getByText("I accept the").click();
  await page.getByRole("button", { name: "Create account" }).click();
}

test.describe("customer journey (simulated payment, fake router)", () => {
  test("create account → choose pass → pay → code → connect → countdown", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Fast Wi-Fi from 105 FCFA/ })).toBeVisible();
    await page.getByRole("link", { name: /1 Hour/ }).first().click();

    // Not signed in: the plan page asks for an account first.
    await expect(page.getByRole("heading", { name: "Create your free account to continue" })).toBeVisible();
    await page.getByRole("link", { name: "Create account" }).last().click();
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await register(page, "Awa Bello", "6 70 00 00 00"); // simulator: payer number ending in 0 succeeds

    // Back on the plan, signed in, payer number prefilled from the account.
    await expect(page).toHaveURL(/\/plans\/1-hour/);
    await expect(page.getByText("Buying as")).toContainText("Awa Bello");
    await expect(page.getByLabel("Mobile Money number")).toHaveValue("670000000");
    await page.getByRole("button", { name: /Pay .*105.*FCFA/ }).click();

    await expect(page).toHaveURL(/\/pay\//);
    await expect(page.getByText("Simulated payment", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Payment confirmed" })).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/account/, { timeout: 15_000 });

    await expect(page.getByRole("heading", { name: "Hi, Awa" })).toBeVisible();
    await expect(page.getByText("How to use your access code")).toBeVisible();
    const code = await page.locator("p.font-mono.tracking-wider").innerText();
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    await expect(page.getByText(/^(59|60) min/)).toBeVisible();

    await expect(page.getByRole("button", { name: /Simulate connect/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: "Connect this device" })).toHaveAttribute("href", /^http:\/\/10\.5\.50\.1\/login#u=[A-Z0-9]{8}&p=/);
    await page.getByRole("button", { name: /Simulate connect/ }).click();
    await expect(page.getByText(/Connected on 1 device/)).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByText(/^(59|60) min/)).toBeVisible();
  });

  test("a failed payment grants nothing", async ({ page }) => {
    await page.goto("/register?next=/plans/1-hour");
    await register(page, "Paul Etoa", "670000011"); // ends in 1 = declined
    await expect(page).toHaveURL(/\/plans\/1-hour/);
    await page.getByRole("button", { name: /Pay/ }).click();
    await expect(page.getByRole("heading", { name: "Payment not completed" })).toBeVisible({ timeout: 20_000 });
    await page.goto("/account");
    await expect(page.getByText("You have no active pass yet.")).toBeVisible();
  });

  test("returning customer signs in with phone + password; wrong password is refused", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login\?next=(%2F|\/)account/);
    await page.getByLabel("Phone number").fill("670000090");
    await page.getByLabel("Password", { exact: true }).fill("not-my-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Wrong phone number or password.")).toBeVisible();
    await page.getByLabel("Password", { exact: true }).fill("demo-customer-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Hi, Demo" })).toBeVisible();
    await expect(page.getByText("DEMO-2345").first()).toBeVisible();
  });

  test("forgot password: prove ownership with an access code, set a new password", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Phone number").fill("670000090");
    await page.getByLabel("Verification code").fill("DEMO-2345");
    await page.getByLabel("New password").fill("brand-new-pass-1");
    await page.getByRole("button", { name: /Set new password/ }).click();
    await expect(page.getByRole("heading", { name: "Hi, Demo" })).toBeVisible();
  });

  test("an existing number cannot register a second account", async ({ page }) => {
    await page.goto("/register");
    await register(page, "Impostor", "670000090");
    await expect(page.getByText(/already has purchases|Already registered/).first()).toBeVisible();
  });

  test("captive portal entry stores the router login URL and invites sign-up", async ({ page }) => {
    await page.goto("/portal?login=http%3A%2F%2F10.5.50.1%2Flogin&mac=AA%3ABB%3ACC%3ADD%3AEE%3AFF&ip=10.5.50.20");
    await expect(page.getByRole("heading", { name: "Welcome to Juthelink" })).toBeVisible();
    await expect(page.getByText("New here? Create a free account first.")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("starling.hotspot"))).toContain("10.5.50.1");
  });
});

test.describe("PWA", () => {
  test("manifest, service worker and offline page are served", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#1d5bd8");
    expect(manifest.icons.some((i: { sizes: string; purpose: string }) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
    const sw = await request.get("/sw.js");
    expect(sw.ok()).toBe(true);
    expect(sw.headers()["cache-control"]).toContain("no-cache");
    expect(await sw.text()).toContain('url.pathname.startsWith("/api/")');
    expect((await request.get("/offline")).ok()).toBe(true);
  });
});
