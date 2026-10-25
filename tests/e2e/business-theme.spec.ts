import { expect, test, type Page } from '@playwright/test';
import { OWNERS, appIsReady, signIn, trySeedPendingProposal } from './support/business';

/**
 * The theme checklist in specs/design-system.md section 7: both themes render, there is no
 * horizontal scroll at 320px, and the screens are captured at the four breakpoints.
 */

const BREAKPOINTS = [
  { label: '320', width: 320, height: 720 },
  { label: '768', width: 768, height: 900 },
  { label: '1024', width: 1024, height: 900 },
  // 1280 is where the events table and the interest grid replace the card lists, so it is
  // the width a column-sizing regression shows up at first.
  { label: '1280', width: 1280, height: 900 },
  { label: '1440', width: 1440, height: 900 },
] as const;

const PAGES = ['/business', '/business/proposals', '/business/events', '/business/insights'] as const;

/**
 * The deeper screens need an id, so they are resolved once by walking to them. The proposal
 * detail and the event editor are the two-column layouts, and the attendee list is the one
 * dense table, so they are the most likely to break at 320px — and none of them were in the
 * matrix before.
 */
async function deepPaths(page: Page): Promise<string[]> {
  const found: string[] = [];

  if (await trySeedPendingProposal(page)) {
    await page.goto('/business/proposals');
    await page.getByRole('link', { name: /review/i }).first().click();
    // Wait for the URL, not just a load state: Review is a client-side navigation, and
    // reading page.url() too early captured the list again under the detail's name, which
    // silently dropped the two-column screen from this matrix.
    await page.waitForURL(/\/business\/proposals\/[0-9a-f-]{36}/);
    found.push(new URL(page.url()).pathname);
  }

  await page.goto('/business/events');
  const row = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Attendees' }) }).first();
  if ((await row.count()) > 0) {
    const href = await row.getByRole('link', { name: 'Attendees' }).getAttribute('href');
    if (href) found.push(href, href.replace('/attendees', '/edit'));
  }
  return found;
}

test.describe('business screens, both themes', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await appIsReady(page)), 'the app or /login is not reachable');
    await signIn(page, OWNERS.kiln);
  });

  for (const theme of ['light', 'dark'] as const) {
    for (const breakpoint of BREAKPOINTS) {
      test(`${theme} at ${breakpoint.label}px`, async ({ page }) => {
        await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });
        await page.emulateMedia({ colorScheme: theme });

        for (const path of [...PAGES, ...(await deepPaths(page))]) {
          await page.goto(path);
          await expect(page.getByRole('main')).toBeVisible();

          // No horizontal page scroll at any width (design-system.md section 3).
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(1);

          await page.screenshot({
            path: `test-results/business-theme/${theme}-${breakpoint.label}-${path.replaceAll('/', '_')}.png`,
            fullPage: true,
          });
        }
      });
    }
  }
});
