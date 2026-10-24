import { expect, test, type Page } from "@playwright/test";
import { CONSUMER, NEW_USER, login, reseed } from "./helpers";

/** design-system.md §7: every agent screen renders in both themes with no horizontal scroll at 320–1440. */
const AGENT_SCREENS = ["/agent", "/agent/preferences", "/agent/permissions", "/agent/log"];
const WIDTHS = [320, 768, 1024, 1440];

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  const res = await request.post("/api/dev/seed");
  expect(res.ok()).toBeTruthy();
});

async function checkScreen(page: Page, path: string, scheme: "light" | "dark", width: number) {
  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.locator("h1").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${path} overflows at ${width}px`).toBeLessThanOrEqual(0);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe(scheme === "light" ? "rgb(240, 242, 245)" : "rgb(24, 25, 26)");
  await page.screenshot({ path: `test-results/theme/${scheme}-${width}${path.replace(/\//g, "_")}.png`, fullPage: true });
}

for (const scheme of ["light", "dark"] as const) {
  for (const width of WIDTHS) {
    test(`agent screens render ${scheme} at ${width}px`, async ({ page, context }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 900 });

      await login(page, NEW_USER.email);
      await checkScreen(page, "/onboarding", scheme, width);

      await context.clearCookies();
      await login(page, CONSUMER.email);
      for (const path of AGENT_SCREENS) await checkScreen(page, path, scheme, width);
    });
  }
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await reseed(page);
  await page.close();
});
