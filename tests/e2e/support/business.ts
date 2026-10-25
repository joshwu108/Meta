import { expect, type Page } from '@playwright/test';
import { OWNER, SEED_PASSWORD, login, reseed } from '../helpers';

/**
 * Business-side steps for the demo scenes, layered on workstream 01's e2e helpers.
 *
 * 05 briefly carried its own sign-in route because `/login` did not exist yet; now that it
 * does, signing in goes through the real page exactly as the demo does, and `reseed()`
 * gives every spec the same starting data.
 */

export const OWNERS = {
  kiln: { email: OWNER.email, password: SEED_PASSWORD },
  ritual: { email: 'owner.ritual-grounds@weave.test', password: SEED_PASSWORD },
} as const;

export type Owner = (typeof OWNERS)[keyof typeof OWNERS];

/** True when the app answers and the demo data is loaded. */
export async function appIsReady(page: Page): Promise<boolean> {
  try {
    const response = await page.request.get('/login');
    if (!response.ok()) return false;
    await reseed(page);
    return true;
  } catch {
    return false;
  }
}

export async function signIn(page: Page, owner: Owner = OWNERS.kiln): Promise<void> {
  await login(page, owner.email, owner.password);
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
  if (/is not migrated yet/i.test(body)) return false;
  // Anything else is a real failure: never let it read as "04 has not landed".
  throw new Error(`could not seed a proposal: ${response.status()} ${body}`);
}

/**
 * True when workstream 04's revise endpoint exists. 04 may merge its pipeline (0400)
 * before its P1 revision work (0403), so the proposal table existing does not imply this.
 * An empty body is invalid for the route, so 404 means absent and 4xx-but-not-404 means
 * present.
 */
export async function revisionsAvailable(page: Page, proposalId: string): Promise<boolean> {
  const response = await page.request.post(`/api/ai/proposals/${proposalId}/revise`, { data: {} });
  return response.status() !== 404;
}

/**
 * One event's row, in whichever presentation the viewport is showing.
 *
 * The events screen renders the same rows twice: a card list on a phone and a table from
 * 1024px up, with the other hidden by CSS. A locator pinned to `listitem` found nothing at
 * Playwright's 1280px default once the table landed, so the row is matched in both and
 * filtered to the visible one — which is also what an owner can actually click.
 */
export function eventRow(page: Page, title: string) {
  return page
    .locator('main li, main tbody tr')
    .filter({ hasText: title })
    .locator('visible=true');
}

/** Asserts a row in the events table reached a status. */
export async function expectEventStatus(page: Page, title: string, status: string): Promise<void> {
  await expect(eventRow(page, title).getByText(status, { exact: false })).toBeVisible();
}
