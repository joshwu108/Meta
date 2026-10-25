import { expect, test } from '@playwright/test';
import { login, reseed } from './helpers';

// The first request to a route compiles it in dev mode, which can take longer than 5s in CI.
const FIRST_REQUEST = { timeout: 20_000 };

test('a public group found on /groups/discover can be joined from its page', async ({ page }) => {
  test.setTimeout(60_000);
  await reseed(page);
  // Elena is onboarded and not in the seeded public group "Mission Makers".
  await login(page, 'elena@commonground.test');
  await page.goto('/groups/discover');
  await page.getByRole('link', { name: /Mission Makers/ }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('tab', { name: /Members/ })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: 'Join group' }).click();
  await expect(page.getByText('You joined Mission Makers')).toBeVisible(FIRST_REQUEST);
  await expect(page.getByText('You’re a member')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Join group' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Plans/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Plans' })).toBeFocused();
});
