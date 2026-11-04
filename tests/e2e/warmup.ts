import type { Browser } from "@playwright/test";

/** The dev server compiles each page on first visit (slow on an external drive): visit them once first. */
export async function warmUp(browser: Browser, paths: string[]) {
  const page = await browser.newPage();
  for (const path of paths) {
    await page.goto(path, { timeout: 300_000 }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 300_000 }).catch(() => undefined);
  }
  await page.close();
}
