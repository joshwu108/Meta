import { expect, type Locator, type Page } from '@playwright/test';

export const SEED_PASSWORD = 'demo-pass-1234';
export const CONSUMER = { email: 'maya@commonground.test', name: 'Maya Chen' };
export const NEW_USER = { email: 'demo.new@commonground.test', name: 'Jordan Lee' };
export const OWNER = { email: 'owner.kiln-and-cup@commonground.test', name: 'Rosa Delgado' };

export async function login(page: Page, email: string, password = SEED_PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** Reload the demo dataset through the dev route so every spec starts from the same state. */
export async function reseed(page: Page): Promise<void> {
  const res = await page.request.post('/api/dev/seed');
  if (!res.ok()) throw new Error(`seed failed: ${res.status()} ${await res.text()}`);
}

/**
 * Click a link and wait for the URL to change, retrying the click if it was swallowed.
 * On a production build the page is visible before React hydrates it, and a click in that
 * window is lost; on `pnpm dev` the slower first render hides this.
 */
export async function clickUntilURL(page: Page, link: Locator, url: RegExp): Promise<void> {
  await expect(async () => {
    if (!url.test(page.url())) await link.click();
    await page.waitForURL(url, { waitUntil: 'commit', timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

/**
 * Wait until React has hydrated the current document (see HydrationMarker). Call after a
 * full navigation (`page.goto`, reload) and before the first click on a production build.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === 'true');
}
