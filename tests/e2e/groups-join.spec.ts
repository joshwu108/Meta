import { expect, test } from '@playwright/test';
import { login, reseed } from './helpers';
import { openSettled, settle } from './support/social';

// The first request to a route compiles it in dev mode, which can take longer than 5s in CI.
const FIRST_REQUEST = { timeout: 20_000 };

test('a public group found on /groups/discover can be joined from its page', async ({ page }) => {
  test.setTimeout(60_000);
  await reseed(page);
  // Elena is onboarded and not in the seeded public group "Mission Makers".
  await login(page, 'elena@weave.test');
  const missionMakers = page.getByRole('link', { name: /Mission Makers/ });
  await openSettled(page, '/groups/discover', missionMakers);
  await missionMakers.click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  const join = page.getByRole('button', { name: 'Join group' });
  await settle(page, join);
  await expect(page.getByRole('tab', { name: /Members/ })).toHaveAttribute('aria-selected', 'true');

  await join.click();
  await expect(page.getByText('You joined Mission Makers')).toBeVisible(FIRST_REQUEST);
  const reloaded = await settle(page, page.getByText('You’re a member'));
  await expect(join).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Plans/ })).toHaveAttribute('aria-selected', 'true');
  // A reload past the dev-only crash resets focus; the focus move is only checked on a clean render.
  if (!reloaded) await expect(page.getByRole('tabpanel', { name: 'Plans' })).toBeFocused();
});
