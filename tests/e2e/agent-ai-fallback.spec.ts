import { expect, test } from "@playwright/test";

const EMPTY = {
  interests: [], interestCategories: [], availabilitySlots: [], socialGoals: [], groupSizePref: null,
  budgetMinCents: null, budgetMaxCents: null, travelRadiusKm: 5, activityPrefs: [], dealbreakers: [], fieldSources: {},
};

test("onboarding falls back to the form when the AI is unavailable", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/agent/chat") {
      return route.fulfill({ status: 503, contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { code: "AI_UNAVAILABLE", message: "The assistant is unavailable right now" } }) });
    }
    const data = path === "/api/agent/preferences" ? EMPTY : { ok: true };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });
  });
  await page.goto("/onboarding");
  await page.getByPlaceholder(/start typing/i).fill("Castro");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByPlaceholder("Message your agent").fill("I like hiking");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "unavailable" })).toBeVisible();
  await page.getByRole("button", { name: "Fill in a form instead" }).click();
  await expect(page.getByRole("heading", { name: "Does this look right?" })).toBeVisible();
  await expect(page.getByText("None yet")).toHaveCount(2);
});
