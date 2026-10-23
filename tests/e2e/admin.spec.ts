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

test.describe("counter sales (cyber-café style)", () => {
  test("support staff sell a pass and get a username + password slip", async ({ page }) => {
    await login(page, "support@starling.local", "starling-dev-support-1");
    await page.getByRole("link", { name: "Sell a pass" }).click();
    await page.getByLabel("Customer phone").fill("670777000");
    await page.getByLabel("Customer name (optional)").fill("Awa Bello");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Record cash sale/ }).click();
    await expect(page.locator("#slip")).toBeVisible();
    await expect(page.locator("#slip")).toContainText(/awa\d{3}/);
    await expect(page.locator("#slip dd").nth(1)).toHaveText(/^\d{6}$/);
    await expect(page.getByText(/Cash sales today: 1/)).toBeVisible();
  });
});

test.describe("router captive-portal pages (preview)", () => {
  test("login page has code and username/password tabs; status page counts down", async ({ page }) => {
    await page.goto("/api/dev/hotspot-preview?page=login&error=invalid+username+or+password");
    await expect(page.getByRole("alert")).toHaveText("invalid username or password");
    await expect(page.getByRole("button", { name: "Access code" })).toBeVisible();
    await page.getByRole("button", { name: "Username & password" }).click();
    await expect(page.getByLabel("Username")).toHaveValue("awa482");
    await expect(page.getByRole("link", { name: "Buy a pass online" })).toHaveAttribute("href", /\/portal\?login=http%3A%2F%2F10\.5\.50\.1%2Flogin/);
    await page.goto("/api/dev/hotspot-preview?page=status");
    await expect(page.locator("#left")).toHaveText(/^1h 12m \d\ds$/);
  });
});

test.describe("printed tickets", () => {
  test("support staff generate a batch and get a printable sheet", async ({ page }) => {
    await login(page, "support@starling.local", "starling-dev-support-1");
    await page.getByRole("link", { name: "Printed tickets" }).click();
    await page.getByLabel("How many tickets").fill("4");
    await page.getByLabel("Batch name").fill("E2E-WEEK");
    await page.getByRole("button", { name: /Generate 4 tickets/ }).click();
    await expect(page.locator("#ticket-sheet > div")).toHaveCount(4);
    await expect(page.locator("#ticket-sheet")).toContainText("from first login");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByText("E2E-WEEK")).toBeVisible();
  });
});
