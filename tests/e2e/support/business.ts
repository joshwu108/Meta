import { expect, type Page } from '@playwright/test';

/**
 * Shared steps for the business demo scenes.
 *
 * Signing in prefers workstream 01's `/login`, which is the path the demo itself takes.
 * Until that page exists, it falls back to the dev-only `POST /api/dev/session`, which does
 * an ordinary password sign-in server-side so the business screens can be driven now
 * rather than after 01 merges.
 */

export const OWNERS = {
  kiln: { email: 'owner.kiln@commonground.test', password: 'commonground-demo' },
  ritual: { email: 'owner.ritual@commonground.test', password: 'commonground-demo' },
} as const;

export type Owner = (typeof OWNERS)[keyof typeof OWNERS];

/** True when the app answers at all. The seeded data has to be there too. */
export async function appIsReady(page: Page): Promise<boolean> {
  try {
    const response = await page.request.get('/api/dev/session');
    // 401 means the route is there and simply has no session yet, which is what we want.
    return response.status() === 401 || response.ok();
  } catch {
    return false;
  }
}

async function loginPageExists(page: Page): Promise<boolean> {
  try {
    const response = await page.request.get('/login');
    return response.ok();
  } catch {
    return false;
  }
}

export async function signIn(page: Page, owner: Owner): Promise<void> {
  if (await loginPageExists(page)) {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(owner.email);
    await page.getByLabel(/password/i).fill(owner.password);
    await page.getByRole('button', { name: /(log in|sign in)/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    return;
  }

  const response = await page.request.post('/api/dev/session', { data: owner });
  expect(
    response.ok(),
    `dev sign-in failed for ${owner.email}: ${response.status()} ${await response.text()}`,
  ).toBe(true);
}

/**
 * Seeds one pending proposal for the signed-in owner through the dev-only route.
 * Returns false when workstream 04's `event_proposals` table is not migrated yet — the
 * inbox route answers 200 with an empty list in that case, so only an attempted write can
 * tell the difference.
 */
export async function trySeedPendingProposal(page: Page, fixture = 'pottery-night'): Promise<boolean> {
  const response = await page.request.post('/api/dev/proposals', { data: { fixture } });
  if (response.ok()) return true;

  const body = await response.text();
  if (/event_proposals/i.test(body)) return false;
  throw new Error(`could not seed a proposal: ${response.status()} ${body}`);
}
