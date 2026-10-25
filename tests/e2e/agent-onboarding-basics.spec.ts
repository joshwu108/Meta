import { expect, test } from "@playwright/test";
import { NEW_USER, login, reseed } from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await reseed(page);
  await page.close();
});

/** The neighborhood field's own placeholder says "e.g. Mission"; typing that must work. */
test("typing a neighborhood the way the placeholder suggests lets onboarding continue", async ({ page }) => {
  await reseed(page);
  await login(page, NEW_USER.email);
  await page.goto("/onboarding");
  const field = page.getByPlaceholder(/start typing/i);

  await field.fill("Atlantis");
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await expect(page.getByText("Pick a neighborhood from the list")).toBeVisible();

  await field.fill("mission");
  await expect(page.getByText("Pick a neighborhood from the list")).toHaveCount(0);
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/users/onboard"));
  await page.getByRole("button", { name: "Continue" }).click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByPlaceholder("Message your agent")).toBeVisible();

  const me = (await (await page.request.get("/api/me")).json()).data;
  expect(me.profile.neighborhood).toBe("Mission District");
});
