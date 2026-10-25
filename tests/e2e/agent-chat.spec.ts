import { expect, test } from "@playwright/test";
import { CONSUMER, login, reseed } from "./helpers";

test.describe.configure({ mode: "serial" });

/**
 * AC4, full stack: agent chat suggestion cards deep-link and each one has a "Why this?" disclosure.
 * People cards must be real seeded users (consented, discoverable), never placeholder ids.
 */
test("agent chat suggests real people with explanations and working deep links", async ({ page }) => {
  await reseed(page);
  await login(page, CONSUMER.email);
  await page.goto("/agent");
  await page.getByPlaceholder("Message your agent").fill("Who should I meet this week?");
  await page.getByRole("button", { name: "Send" }).click();

  const people = page.locator('a[href^="/match?focus="]');
  await expect(people.first()).toBeVisible();
  const hrefs = await people.evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  for (const href of hrefs) {
    expect(href).toMatch(/^\/match\?focus=[0-9a-f-]{36}$/);
    expect(href).not.toContain("00000000-0000-4000-8000");
  }
  const names = await people.allInnerTexts();
  expect(names).not.toContain("Maya Chen");

  const events = page.locator('a[href^="/events/"]');
  await expect(events.first()).toBeVisible();
  const eventHrefs = await events.evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  for (const href of eventHrefs) {
    expect(href).toMatch(/^\/events\/[0-9a-f-]{36}$/);
    expect(href).not.toContain("00000000-0000-4000-8000");
  }

  const whys = page.getByText("Why this?");
  expect(await whys.count()).toBeGreaterThanOrEqual(hrefs.length + eventHrefs.length);
  await whys.first().click();
  await expect(page.locator("details[open]").first()).toBeVisible();

  // The deep link opens 06's real event page, not a not-found screen.
  const title = (await events.first().innerText()).trim();
  await events.first().click();
  await page.waitForURL(/\/events\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: title }).first()).toBeVisible();
});
