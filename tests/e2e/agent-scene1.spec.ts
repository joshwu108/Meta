import { expect, test } from "@playwright/test";
import { NEW_USER, login, reseed } from "./helpers";

/**
 * Scene 1, full stack: real auth, real API and database, MOCK_AI fixture for the model.
 * `demo.new@` is seeded without preferences so the onboarding runs from scratch.
 */
const SCENE_1 = "I just moved here, I like pottery and coffee shops, free Thursday evenings, small groups.";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await reseed(page);
});

test("Scene 1: canonical sentence → review shows pottery, coffee, Thursday evening, small → confirm → Discover", async ({ page }) => {
  await login(page, NEW_USER.email);
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: `Hi ${NEW_USER.name}, welcome to Weave` })).toBeVisible();

  await page.getByPlaceholder(/start typing/i).fill("Mission District");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByPlaceholder("Message your agent").fill(SCENE_1);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/I heard/).first()).toBeVisible();
  await page.getByRole("button", { name: "Review my profile" }).click();

  await expect(page.getByRole("heading", { name: "Does this look right?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove pottery" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove coffee" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thu evening" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("radio", { name: "Small (3–6)" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("No limit set")).toBeVisible();
  await expect(page.getByText("AI inferred").first()).toBeVisible();

  // AC2: deleting an inferred value persists.
  await page.getByRole("button", { name: "Remove coffee" }).click();
  await expect(page.getByRole("button", { name: "Remove coffee" })).toHaveCount(0);
  await expect.poll(async () => (await (await page.request.get("/api/agent/preferences")).json()).data.interests).toEqual(["pottery"]);

  await page.getByRole("switch", { name: "Match me with people" }).click();
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await page.waitForURL("**/discover");

  const consent = (await (await page.request.get("/api/agent/permissions")).json()).data;
  expect(consent).toMatchObject({ allow_matching: true, allow_demand_aggregation: false });
  const prefs = (await (await page.request.get("/api/agent/preferences")).json()).data;
  expect(prefs.fieldSources.interests).toBe("user_set");
});
