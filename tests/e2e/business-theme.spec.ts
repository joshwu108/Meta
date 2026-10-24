import { expect, test } from '@playwright/test';
import { OWNERS, appIsReady, signIn } from './support/business';

/**
 * The theme checklist in specs/design-system.md section 7: both themes render, there is no
 * horizontal scroll at 320px, and the screens are captured at the four breakpoints.
 */

const BREAKPOINTS = [
  { label: '320', width: 320, height: 720 },
  { label: '768', width: 768, height: 900 },
  { label: '1024', width: 1024, height: 900 },
  { label: '1440', width: 1440, height: 900 },
] as const;

const PAGES = ['/business', '/business/proposals', '/business/events'] as const;

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

        for (const path of PAGES) {
          await page.goto(path);
          await expect(page.getByRole('main')).toBeVisible();

          // No horizontal page scroll at any width (design-system.md section 3).
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(1);

          await page.screenshot({
            path: `tests/e2e/__screenshots__/${theme}-${breakpoint.label}-${path.replaceAll('/', '_')}.png`,
            fullPage: true,
          });
        }
      });
    }
  }
});
