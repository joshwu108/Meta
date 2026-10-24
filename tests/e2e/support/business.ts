import type { Page } from '@playwright/test';

/**
 * Shared steps for the business demo scenes. Logging in goes through workstream 01's
 * `/login` page, which is the path the demo itself takes.
 */

export const OWNERS = {
  kiln: { email: 'owner.kiln@commonground.test', password: 'commonground-demo' },
} as const;

/** True when the app and workstream 01's login page are both reachable. */
export async function appIsReady(page: Page): Promise<boolean> {
  try {
    const response = await page.goto('/login', { waitUntil: 'domcontentloaded' });
    return response !== null && response.status() < 400;
  } catch {
    return false;
  }
}

export async function signIn(page: Page, owner: { email: string; password: string }): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(owner.email);
  await page.getByLabel(/password/i).fill(owner.password);
  await page.getByRole('button', { name: /(log in|sign in)/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** Seeds one pending proposal for the signed-in owner through the dev-only route. */
export async function seedPendingProposal(page: Page, fixture = 'pottery-night'): Promise<void> {
  const response = await page.request.post('/api/dev/proposals', { data: { fixture } });
  if (!response.ok()) {
    throw new Error(`could not seed a proposal: ${response.status()} ${await response.text()}`);
  }
}
