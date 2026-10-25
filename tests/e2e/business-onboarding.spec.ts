import { expect, test, type Page } from '@playwright/test';
import { appIsReady } from './support/business';

/**
 * Business Screen 1. Every other 05 spec signs in as an owner who already has a venue, so
 * this is the only coverage of how a business actually enters the product.
 */

const unique = () => `Glasshouse ${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Signs up a throwaway account through 01's business signup, which is the real route into
 * onboarding (`/signup?as=business` redirects here, spec 01 §5).
 *
 * Deliberately not a seeded user: an earlier version of this spec signed in as the seeded
 * consumer and gave her a venue, which left her a business owner for every spec that ran
 * afterwards and emptied the proposal inbox in Scene 4.
 */
async function signUpAsBusiness(page: Page): Promise<void> {
  const stamp = `${Date.now().toString().slice(-7)}${Math.random().toString(36).slice(2, 6)}`;
  await page.goto('/signup?as=business');
  await page.getByLabel('Your name').fill('Sam Rivera');
  await page.getByLabel('Email').fill(`biz.${stamp}@weave.test`);
  await page.getByLabel('Password').fill('onboarding-test-pass');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /sign up|create/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/signup'), { timeout: 20_000 });
}

test.describe('a new business sets itself up', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await appIsReady(page)), 'the app is not reachable');
    await signUpAsBusiness(page);
  });

  test('walks the four steps and lands on the dashboard', async ({ page }) => {
    const name = unique();
    await page.goto('/business/onboarding');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Set up your venue' })).toBeVisible();

    // Step 1 cannot be left without a name.
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await page.getByLabel('Venue name').fill(name);
    await page.getByLabel('Description').fill('A plant-filled room for small workshops.');
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByLabel('Address').fill('500 Hayes St, San Francisco');
    await page.getByLabel('Thursday opens').fill('09:00');
    await page.getByLabel('Thursday closes').fill('21:00');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3 needs at least one hosting slot.
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await page.getByRole('button', { name: 'Thursday evenings' }).click();
    await page.getByLabel('Capacity').fill('16');
    await page.getByRole('button', { name: 'Continue' }).click();

    // The venue is open on the day it offered, so no warning.
    await expect(page.getByText(/but your hours have that day closed/i)).toHaveCount(0);
    await expect(page.getByText(name)).toBeVisible();
    await page.getByRole('button', { name: /finish setup/i }).click();

    await page.waitForURL(/\/business$/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    // The geocoder resolved the address rather than falling back to the city centre.
    await expect(page.getByText(/Hayes Valley/)).toBeVisible();
  });

  test('warns when a hosting slot falls on a day the venue is closed', async ({ page }) => {
    await page.goto('/business/onboarding');
    await page.getByLabel('Venue name').fill(unique());
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByLabel('Address').fill('500 Hayes St, San Francisco');
    await page.getByLabel('Monday opens').fill('10:00');
    await page.getByLabel('Monday closes').fill('18:00');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Offering Thursday evenings while Thursday is closed is a dead end: 04 would send
    // proposals that 05 then refuses to approve.
    await page.getByRole('button', { name: 'Thursday evenings' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText(/you said you can host thursday evenings/i)).toBeVisible();
    await expect(page.getByText(/could not accept/i)).toBeVisible();
  });
});
