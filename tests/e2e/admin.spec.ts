import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test.describe("admin access control", () => {
  test("unauthenticated visitors are sent to the login page and APIs refuse them", async ({ page, request }) => {
    await page.goto("/admin/packages");
    await expect(page).toHaveURL(/\/admin\/login/);
    const res = await request.get("/api/admin/customers");
    expect(res.status()).toBe(401);
  });

  test("wrong password is rejected", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill("admin@starling.local");
    await page.getByLabel("Password").fill("not-the-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  });

  test("support staff cannot manage staff or packages (server-enforced)", async ({ page }) => {
    await login(page, "support@starling.local", "starling-dev-support-1");
    await expect(page.getByRole("link", { name: "Staff" })).toHaveCount(0);
    await page.goto("/admin/staff");
    await expect(page.getByText("You do not have permission to open that page.")).toBeVisible();
    const api = await page.request.get("/api/admin/staff");
    expect(api.status()).toBe(403);
    // Even with a valid session, mutations need the CSRF token and the right permission.
    const create = await page.request.post("/api/admin/packages", { data: { slug: "x" }, headers: { origin: "http://localhost:3100" } });
    expect([403]).toContain(create.status());
  });

  test("an administrator creates a package that customers can then buy", async ({ page }) => {
    await login(page, "admin@starling.local", "starling-dev-admin-1");
    await page.goto("/admin/packages");
    await page.getByRole("button", { name: "New package" }).click();
    await page.getByLabel("Name").fill("3 Hours");
    await page.getByLabel("Slug (URL)").fill("3-hours");
    await page.getByLabel("Price (XAF, whole francs)").fill("125");
    await page.locator("#dur").fill("3");
    await page.getByLabel("Duration unit").selectOption({ label: "hours" });
    await page.getByRole("button", { name: "Create package" }).click();
    await expect(page.getByText("/3-hours")).toBeVisible();

    await page.goto("/plans");
    await expect(page.getByRole("link", { name: /3 Hours/ })).toBeVisible();
    await expect(page.getByText("3 hours of internet")).toBeVisible();
  });

  test("dashboard labels simulated integrations", async ({ page }) => {
    await login(page, "admin@starling.local", "starling-dev-admin-1");
    await expect(page.getByText(/Test mode: payments are simulated/)).toBeVisible();
    await page.goto("/admin/network");
    await page.getByRole("button", { name: "Check health" }).click();
    await expect(page.getByText(/"simulated": true/)).toBeVisible();
  });
});
