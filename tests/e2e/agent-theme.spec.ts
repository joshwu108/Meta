import { expect, test, type Page } from "@playwright/test";

/** design-system.md §7: every agent screen renders in both themes with no horizontal scroll at 320–1440. */
const SCREENS = ["/onboarding", "/agent", "/agent/preferences", "/agent/permissions", "/agent/log"];
const WIDTHS = [320, 768, 1024, 1440];

const PREFS = {
  interests: ["pottery", "coffee", "board-games"], interestCategories: ["creative"], availabilitySlots: ["thu_eve"],
  socialGoals: ["make_friends"], groupSizePref: "small", budgetMinCents: null, budgetMaxCents: 2500, travelRadiusKm: 5,
  activityPrefs: ["beginner-friendly"], dealbreakers: [], fieldSources: { interests: "ai_inferred" },
};
const CONSENT = { allow_matching: true, allow_demand_aggregation: false, allow_group_planning: true, share_interests_with_attendees: false, share_name_with_business: false };
const LOG = [{ id: "1", actor: "coordination", action: "share_preferences", permissions_used: ["matching"], result: "Shared your interests and availability for people matching", created_at: new Date().toISOString() }];

async function mockApi(page: Page) {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/preferences") ? PREFS : path.endsWith("/permissions") ? CONSENT : path.endsWith("/log") ? LOG : {};
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });
  });
}

for (const scheme of ["light", "dark"] as const) {
  for (const width of WIDTHS) {
    test(`agent screens render ${scheme} at ${width}px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 900 });
      await mockApi(page);
      for (const path of SCREENS) {
        await page.goto(path);
        await expect(page.locator("h1")).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} overflows at ${width}px`).toBeLessThanOrEqual(0);
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        expect(bg).toBe(scheme === "light" ? "rgb(240, 242, 245)" : "rgb(24, 25, 26)");
        await page.screenshot({ path: `test-results/theme/${scheme}-${width}${path.replace(/\//g, "_")}.png`, fullPage: true });
      }
    });
  }
}
