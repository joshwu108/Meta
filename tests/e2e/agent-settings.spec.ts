import { expect, test, type Page } from "@playwright/test";
import { CONSUMER, login, reseed } from "./helpers";

/** Full stack: settings pages persist what the user changes, and the activity log shows sharing (AC5). */
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await reseed(page);
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await reseed(page);
  await page.close();
});

const permissions = async (page: Page) => (await (await page.request.get("/api/agent/permissions")).json()).data;
const preferences = async (page: Page) => (await (await page.request.get("/api/agent/preferences")).json()).data;

test("a consent switch persists across reloads", async ({ page }) => {
  await login(page, CONSUMER.email);
  await page.goto("/agent/permissions");
  const toggle = page.getByRole("switch", { name: "Help plan my groups" });
  const before = (await toggle.getAttribute("aria-checked")) === "true";

  const saved = page.waitForResponse((r) => r.url().endsWith("/api/agent/permissions") && r.request().method() === "PATCH");
  await toggle.click();
  expect((await saved).ok()).toBe(true);
  await expect(toggle).toHaveAttribute("aria-checked", String(!before));

  await page.reload();
  await expect(page.getByRole("switch", { name: "Help plan my groups" })).toHaveAttribute("aria-checked", String(!before));
  expect((await permissions(page)).allow_group_planning).toBe(!before);
});

test("a manually added interest is saved as user_set and can be removed", async ({ page }) => {
  await login(page, CONSUMER.email);
  await page.goto("/agent/preferences");
  await page.getByLabel("Add to Interests").fill("kintsugi");
  await page.getByRole("button", { name: "Add" }).first().click();
  await expect(page.getByRole("button", { name: "Remove kintsugi" })).toBeVisible();

  await expect.poll(async () => (await preferences(page)).interests).toContain("kintsugi");
  expect((await preferences(page)).fieldSources.interests).toBe("user_set");

  await page.reload();
  await page.getByRole("button", { name: "Remove kintsugi" }).click();
  await expect(page.getByRole("button", { name: "Remove kintsugi" })).toHaveCount(0);
  await expect.poll(async () => (await preferences(page)).interests).not.toContain("kintsugi");
});

test("the activity log shows when another member's agent shared your preferences for matching (AC5)", async ({ page, context }) => {
  await login(page, "leo@commonground.test");
  await page.goto("/agent");
  await page.getByPlaceholder("Message your agent").fill("Who should I meet?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator('a[href^="/match?focus="]').first()).toBeVisible();

  await context.clearCookies();
  await login(page, CONSUMER.email);
  await page.goto("/agent/log");
  await expect(page.getByRole("heading", { name: "Activity log" })).toBeVisible();
  await expect(page.getByText(/matching/).first()).toBeVisible();
});
