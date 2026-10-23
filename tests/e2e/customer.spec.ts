import { expect, test } from "@playwright/test";

test.describe("customer purchase flow (simulated payment, fake router)", () => {
  test("browse plans, pay, receive a code, connect, see countdown", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Fast Wi-Fi from 100 FCFA/ })).toBeVisible();
    await expect(page.getByText("1 Hour").first()).toBeVisible();
    await page.getByRole("link", { name: /1 Hour/ }).first().click();

    await expect(page.getByText("Test mode")).toBeVisible();
    await page.getByLabel("Mobile Money number").fill("6 70 00 00 00"); // simulator: ends in 0 = success
    await page.getByText("I accept the").click();
    await page.getByRole("button", { name: /Pay .*100.*FCFA/ }).click();

    await expect(page).toHaveURL(/\/pay\//);
    await expect(page.getByText("Simulated payment", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Payment confirmed" })).toBeVisible({ timeout: 20_000 });

    await expect(page).toHaveURL(/\/account/, { timeout: 15_000 });
    await expect(page.getByText("Time remaining")).toBeVisible();
    const code = await page.locator("p.font-mono.tracking-wider").innerText();
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    await expect(page.getByText(/^(59|60) min/)).toBeVisible();

    // Router has the user once provisioning completes; then the device can "log in".
    await expect(page.getByRole("button", { name: /Simulate connect/ })).toBeVisible({ timeout: 20_000 });
    const connect = page.getByRole("link", { name: "Connect this device" });
    await expect(connect).toHaveAttribute("href", /^http:\/\/10\.5\.50\.1\/login\?username=[A-Z0-9]{8}&password=/);
    await page.getByRole("button", { name: /Simulate connect/ }).click();
    await expect(page.getByText(/Connected on 1 device/)).toBeVisible({ timeout: 20_000 });

    // Countdown survives a reload (derived from server data).
    await page.reload();
    await expect(page.getByText(/^(59|60) min/)).toBeVisible();
  });

  test("a failed payment grants nothing", async ({ page }) => {
    await page.goto("/plans/1-hour");
    await page.getByLabel("Mobile Money number").fill("690000001"); // ends in 1 = declined
    await page.getByText("I accept the").click();
    await page.getByRole("button", { name: /Pay/ }).click();
    await expect(page.getByRole("heading", { name: "Payment not completed" })).toBeVisible({ timeout: 20_000 });
    await page.goto("/account");
    await expect(page.getByText("You have no active pass yet.")).toBeVisible();
  });

  test("a returning customer recovers access with phone and code", async ({ page }) => {
    await page.goto("/account");
    await page.getByLabel("Phone number", { exact: true }).fill("670000090");
    await page.getByLabel("Access code").fill("DEMO-2345");
    await page.getByRole("button", { name: "Show my access" }).click();
    await expect(page.getByText("DEMO-2345")).toBeVisible();
  });

  test("captive portal entry stores the router login URL", async ({ page }) => {
    await page.goto("/portal?login=http%3A%2F%2F10.5.50.1%2Flogin&mac=AA%3ABB%3ACC%3ADD%3AEE%3AFF&ip=10.5.50.20");
    await expect(page.getByRole("heading", { name: "Welcome to Starling Wi-Fi" })).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem("starling.hotspot"));
    expect(stored).toContain("10.5.50.1");
    await page.goto("/portal?login=https%3A%2F%2Fevil.example.com%2Flogin");
    await expect(page.getByRole("heading", { name: "Welcome to Starling Wi-Fi" })).toBeVisible();
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
    expect((await request.get("/icons/icon-512.png")).ok()).toBe(true);
  });
});
