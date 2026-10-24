import { expect, test } from '@playwright/test';
import { CONSUMER, login } from './helpers';

const WIDTHS = [320, 375, 768, 1024, 1440] as const;

test('signed-in consumer shell never scrolls sideways (design-system §3)', async ({ page }) => {
  await login(page, CONSUMER.email);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(0);
    await expect(page.getByTestId('notification-bell')).toBeVisible();
  }
});

test('desktop shell renders the default agent rail from the @aside slot', async ({ page }) => {
  await login(page, CONSUMER.email);
  await page.setViewportSize({ width: 1440, height: 900 });
  const aside = page.getByRole('complementary', { name: 'Contextual' });
  await expect(aside).toBeVisible();
  await expect(aside.getByText('Your agent', { exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Events' }).click();
  await page.waitForURL(/\/events$/);
  await expect(aside.getByText('Your agent', { exact: true })).toBeVisible();
});

test('mobile shell shows the bottom tab bar and hides the rails', async ({ page }) => {
  await login(page, CONSUMER.email);
  await page.setViewportSize({ width: 375, height: 800 });
  const tabs = page.getByRole('navigation', { name: 'Primary' });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole('link')).toHaveCount(5);
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
  await expect(page.getByRole('complementary', { name: 'Contextual' })).toBeHidden();
});
