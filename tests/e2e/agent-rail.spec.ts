import { expect, test } from '@playwright/test';
import { CONSUMER, login, reseed } from './helpers';

// The consumer layout only renders for onboarded users, so the right rail must never claim the
// agent does not know them yet, and /agent (which draws its own rail) must not get a second one.

test('the right rail describes a working agent and links to it', async ({ page }) => {
  await login(page, CONSUMER.email);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/match');
  const aside = page.getByRole('complementary', { name: 'Contextual' });
  await expect(aside.getByText('Your agent', { exact: true })).toBeVisible();
  await expect(aside.getByText(/Suggestions appear here once/)).toHaveCount(0);
  await expect(aside.getByRole('link', { name: 'Open your agent' })).toHaveAttribute('href', '/agent');
});

test('the agent page shows one agent rail, not the shell placeholder as well', async ({ page }) => {
  await login(page, CONSUMER.email);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/agent');
  await expect(page.getByRole('heading', { name: 'My AI agent' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Contextual' }).getByText('Your agent', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Your agent', { exact: true })).toHaveCount(1);
});

// ws02 Lenovo: the /agent settings rail lives in the shell's right rail at desktop width and inline on mobile.
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  expect((await request.post("/api/dev/seed")).ok()).toBeTruthy();
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await reseed(page);
  await page.close();
});

test("desktop: the rail opens the agent, and /agent shows its settings in the shell rail", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, CONSUMER.email);

  await page.goto("/match");
  const rail = page.getByRole("complementary", { name: "Contextual" });
  await expect(rail.getByRole("link", { name: "Open your agent" })).toBeVisible();
  await expect(rail.getByText(/Suggestions appear here once/)).toHaveCount(0);

  await rail.getByRole("link", { name: "Open your agent" }).click();
  await page.waitForURL("**/agent");
  await expect(page.getByRole("heading", { name: "My AI agent" })).toBeVisible();
  // Exactly one settings rail is exposed, and it is the one in the shell's right rail (the inline copy is hidden).
  await expect(page.getByRole("complementary", { name: "Your agent settings" })).toHaveCount(1);
  await expect(rail.getByRole("complementary", { name: "Your agent settings" })).toBeVisible();
  await expect(rail.getByRole("tab", { name: "Preferences" })).toBeVisible();
  await expect(rail.getByRole("link", { name: "Edit preferences" })).toBeVisible();
});

test("mobile: /agent shows its settings tabs under the chat", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, CONSUMER.email);
  await page.goto("/agent");
  await expect(page.locator("#main").getByRole("tab", { name: "Permissions" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
