import { expect, test } from '@playwright/test';
import { CONSUMER, login } from './helpers';

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
