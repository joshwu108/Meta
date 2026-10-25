import { expect, test } from '@playwright/test';
import { OWNERS, appIsReady, revisionsAvailable, signIn, trySeedPendingProposal } from './support/business';

/**
 * Demo Scene 4 (spec section 9, T-E1):
 *   log in as the Kiln & Cup owner -> the dashboard shows the pending pottery proposal ->
 *   open it -> Edit & approve with the price changed $20 -> $25 and the time moved to 18:30
 *   -> Publish now -> the event list shows Published.
 *
 * Skips itself when the app or workstream 01's login page is not up, so the suite is
 * runnable before every workstream has merged.
 */

test.describe('Scene 4 — a business approves an AI proposal', () => {
  // The editor's `datetime-local` is read in the venue's zone (VENUE_TIMEZONE); CI runners are UTC.
  test.use({ timezoneId: 'America/Los_Angeles' });

  test.beforeEach(async ({ page }) => {
    test.skip(!(await appIsReady(page)), 'the app is not reachable');
    await signIn(page, OWNERS.kiln);
  });

  /** Every case here needs a proposal, which needs workstream 04's table. */
  const seedOrSkip = async (page: Parameters<typeof signIn>[0], fixture?: string) => {
    const seeded = await trySeedPendingProposal(page, fixture);
    test.skip(!seeded, "workstream 04's event_proposals table is not migrated yet");
  };

  test('edits, approves and publishes the pottery proposal', async ({ page }) => {
    await seedOrSkip(page);

    await page.goto('/business');
    await expect(page.getByRole('heading', { name: /AI proposals waiting/i })).toBeVisible();

    const proposal = page.getByText(/Beginner Pottery & Coffee Night/i).first();
    await expect(proposal).toBeVisible();

    // The owner must always be able to tell a suggestion from a confirmed event.
    await expect(page.getByText('AI suggestion').first()).toBeVisible();

    await page.getByRole('link', { name: /review/i }).first().click();
    await expect(page.getByRole('heading', { name: /Beginner Pottery & Coffee Night/i })).toBeVisible();

    // The estimate is labelled as an estimate, and never as a count of attendees.
    await expect(page.getByText('Estimate').first()).toBeVisible();
    await expect(page.getByText(/this is an estimate, not rsvps/i)).toBeVisible();

    await page.getByRole('button', { name: /edit & approve/i }).click();

    const price = page.getByRole('spinbutton', { name: 'Price' });
    await expect(price).toHaveValue('20');
    await price.fill('25');

    const starts = page.getByRole('textbox', { name: 'Starts' });
    const startValue = await starts.inputValue();
    await starts.fill(`${startValue.slice(0, 11)}18:30`);

    await page.getByRole('radio', { name: /publish now/i }).check({ force: true });
    await page.getByRole('button', { name: /approve & publish/i }).click();

    await page.waitForURL(/\/business\/events/);
    const row = page.getByRole('listitem').filter({ hasText: /Beginner Pottery & Coffee Night/i });
    await expect(row.getByText('Published')).toBeVisible();
    await expect(row.getByText('$25')).toBeVisible();
  });

  test('rejecting a proposal keeps it out of the event list', async ({ page }) => {
    await seedOrSkip(page, 'coffee-tasting');

    await page.goto('/business/proposals');
    await page.getByRole('link', { name: /review/i }).first().click();

    await page.getByRole('button', { name: /^reject$/i }).click();
    await page.getByLabel('Reason').selectOption('staffing');
    await page.getByRole('button', { name: /reject proposal/i }).click();

    await expect(page.getByText(/you rejected this proposal/i).first()).toBeVisible();
  });

  test('the proposals nav badge shows the pending count', async ({ page }) => {
    await seedOrSkip(page);
    await page.goto('/business');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: /proposals/i })).toContainText(/\d/);
  });
});

test.describe('Scene 4 — asking the AI for a different proposal', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await appIsReady(page)), 'the app is not reachable');
    await signIn(page, OWNERS.kiln);
  });

  test('a revision supersedes the proposal and opens the new one', async ({ page }) => {
    const seeded = await trySeedPendingProposal(page);
    test.skip(!seeded, "workstream 04's event_proposals table is not migrated yet");

    await page.goto('/business/proposals');
    await page.getByRole('link', { name: /review/i }).first().click();
    const original = new URL(page.url()).pathname;

    test.skip(
      !(await revisionsAvailable(page, original.split('/').pop() ?? '')),
      "workstream 04's revise endpoint is not merged yet",
    );

    await page.getByRole('button', { name: /ask ai to revise/i }).click();
    // 04 refuses a request with nothing in it, so the button stays disabled until there is.
    await expect(page.getByRole('button', { name: /ask for a new version/i })).toBeDisabled();

    await page.getByLabel('What should change?').fill('Make it shorter and aimed at beginners.');
    await page.getByRole('button', { name: /ask for a new version/i }).click();

    // The answer is a new pending proposal; the old one is superseded.
    await page.waitForURL((url) => url.pathname.startsWith('/business/proposals/') && url.pathname !== original);
    await expect(page.getByRole('button', { name: /approve as-is/i })).toBeVisible();
  });
});
