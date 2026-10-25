import { expect, test, type Page } from '@playwright/test';
import { OWNERS, appIsReady, eventRow, signIn } from './support/business';

/**
 * The manual event lifecycle through the UI: create a draft, edit it, publish it, read the
 * attendee page, then cancel it. This is the half of workstream 05 that needs nothing from
 * workstream 04, so it runs today and covers the editor, the events table, the status
 * pills, the capacity meter and the cancel flow.
 *
 * Scene 4 (approving an AI proposal) is in scene4-business.spec.ts and waits on 04.
 */

/**
 * The desktop and mobile projects run against the same database at the same time, so a
 * title has to be unique across both. A millisecond stamp alone is not enough.
 */
const unique = () =>
  `Studio Night ${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 7)}`;

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in the browser's own zone. */
function nextThursday(hour: number, minute = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + ((4 - date.getDay() + 7) % 7 || 7));
  date.setHours(hour, minute, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

test.describe('a business runs its own event', () => {
  // Opening hours are checked in the venue's zone (VENUE_TIMEZONE), so the browser filling
  // `datetime-local` has to be in it too. CI runners default to UTC.
  test.use({ timezoneId: 'UTC' });

  test.beforeEach(async ({ page }) => {
    test.skip(!(await appIsReady(page)), 'the app is not reachable');
    await signIn(page, OWNERS.kiln);
  });

  test('creates a draft, publishes it, then cancels it', async ({ page }) => {
    const title = unique();

    await page.goto('/business/events/new');
    await expect(page.getByRole('heading', { name: 'New event' })).toBeVisible();

    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Description').fill('Drop in, throw a pot, meet people.');
    await page.getByLabel('Format').fill('Open studio');
    await page.getByLabel('Starts').fill(nextThursday(18));
    await page.getByLabel('Ends').fill(nextThursday(20));
    await page.getByLabel('Capacity').fill('10');
    await page.getByLabel('Price').fill('18');

    await page.getByRole('button', { name: /save as draft/i }).click();
    await page.waitForURL(/\/business\/events$/);

    const row = eventRow(page, title);
    await expect(row.getByText('Draft')).toBeVisible();
    await expect(row.getByText('$18')).toBeVisible();

    // Edit, then publish from the editor.
    await row.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByRole('heading', { name: 'Edit event' })).toBeVisible();
    await page.getByLabel('Capacity').fill('12');
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForURL(/\/business\/events$/);

    await eventRow(page, title).getByRole('link', { name: 'Edit' }).click();
    // Wait for the editor: the table rows carry a Publish button of their own now.
    await expect(page.getByRole('heading', { name: 'Edit event' })).toBeVisible();
    await page.getByRole('button', { name: /^publish$/i }).click();
    await page.waitForURL(/\/business\/events$/);

    const published = eventRow(page, title);
    await expect(published.getByText('Published')).toBeVisible();
    await expect(published.getByRole('meter')).toHaveAttribute('aria-valuemax', '12');

    // The dashboard counts it as upcoming.
    await page.goto('/business');
    await expect(eventRow(page, title)).toBeVisible();

    // Attendees: counts first, nobody has RSVP'd yet.
    await page.goto('/business/events');
    await eventRow(page, title).getByRole('link', { name: 'Attendees' }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('No confirmed attendees yet.')).toBeVisible();

    // Cancelling needs a reason.
    await page.goto('/business/events');
    await eventRow(page, title).getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByRole('heading', { name: 'Edit event' })).toBeVisible();
    await page.getByRole('button', { name: /cancel event/i }).first().click();
    await page.getByLabel('Reason').fill('The kiln needs repairing');
    await page.getByRole('button', { name: /cancel event/i }).last().click();
    await page.waitForURL(/\/business\/events$/);

    await expect(
      eventRow(page, title).getByText('Cancelled'),
    ).toBeVisible();
  });

  test('publishes and cancels straight from the events table', async ({ page }) => {
    const title = unique();

    // Spec section 7, Screen 5: the row itself offers edit, publish and cancel.
    await page.goto('/business/events/new');
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Description').fill('Wheel time, then coffee.');
    await page.getByLabel('Starts').fill(nextThursday(18));
    await page.getByLabel('Ends').fill(nextThursday(20));
    await page.getByLabel('Capacity').fill('6');
    await page.getByRole('button', { name: /save as draft/i }).click();
    await page.waitForURL(/\/business\/events$/);

    const row = () => eventRow(page, title);
    await expect(row().getByText('Draft')).toBeVisible();

    await row().getByRole('button', { name: 'Publish' }).click();
    await expect(row().getByText('Published')).toBeVisible();
    // A published event can no longer be published again.
    await expect(row().getByRole('button', { name: 'Publish' })).toHaveCount(0);

    await row().getByRole('link', { name: 'Cancel' }).click();
    // The row sends the owner to the editor with the reason panel already open.
    await expect(page.getByRole('heading', { name: /cancel this event/i })).toBeVisible();
    await page.getByLabel('Reason').fill('The kiln needs repairing');
    await page.getByRole('button', { name: /cancel event/i }).last().click();
    await page.waitForURL(/\/business\/events$/);

    await expect(row().getByText('Cancelled')).toBeVisible();
    await expect(row().getByRole('link', { name: 'Cancel' })).toHaveCount(0);
  });

  test('refuses an event the venue cannot host and says why', async ({ page }) => {
    await page.goto('/business/events/new');

    await page.getByLabel('Title').fill(unique());
    await page.getByLabel('Description').fill('Far too many people.');
    await page.getByLabel('Starts').fill(nextThursday(18));
    await page.getByLabel('Ends').fill(nextThursday(20));
    // Kiln & Cup is seeded with a capacity of 12.
    await page.getByLabel('Capacity').fill('400');

    await page.getByRole('button', { name: /save as draft/i }).click();

    // A summary alert, plus an inline error wired to the offending field.
    await expect(page.getByText(/these details do not fit the venue/i)).toBeVisible();
    const capacity = page.getByLabel('Capacity');
    await expect(capacity).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#event-capacity-error')).toContainText(/can host 12 people, not 400/i);
    await expect(page).toHaveURL(/\/business\/events\/new$/);
  });

  test('refuses a time outside opening hours', async ({ page }) => {
    await page.goto('/business/events/new');

    await page.getByLabel('Title').fill(unique());
    await page.getByLabel('Description').fill('Far too late.');
    // Seeded hours for Thursday are 09:00-21:00.
    await page.getByLabel('Starts').fill(nextThursday(23));
    await page.getByLabel('Ends').fill(nextThursday(23, 30));
    await page.getByLabel('Capacity').fill('8');

    await page.getByRole('button', { name: /save as draft/i }).click();
    await expect(page.getByText(/these details do not fit the venue/i)).toBeVisible();
    await expect(page.getByLabel('Starts')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#event-starts-error')).toContainText(/open 09:00-21:00 on thu/i);
  });

});

/**
 * The desktop table (design-system.md section 3). Playwright's default viewport is 1280px,
 * which is exactly where the table replaces the card list, so these run as a desktop owner
 * sees them. The ordering is asserted against a sorted copy of what is actually on screen
 * rather than against fixture titles, because other specs add events to this venue.
 */
test.describe('the events table on a desktop', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await appIsReady(page)), 'the app is not reachable');
    await signIn(page, OWNERS.kiln);
    await page.goto('/business/events');
  });

  const titles = (page: Page) => page.locator('tbody tr td:nth-child(2)').allInnerTexts();

  test('shows columns instead of cards, and announces how it is sorted', async ({ page }) => {
    await expect(page.locator('main table')).toBeVisible();
    await expect(page.locator('main ul li').first()).toBeHidden();

    // Default: soonest first, which is what the column says before anyone clicks it.
    await expect(page.locator('th', { hasText: 'When' })).toHaveAttribute('aria-sort', 'ascending');
  });

  test('sorts by event name and flips on a second click', async ({ page }) => {
    const header = page.getByRole('button', { name: 'Event' });

    await header.click();
    const ascending = (await titles(page)).map((t) => t.trim());
    // One row is trivially sorted, so the assertion below would pass without sorting at all.
    expect(ascending.length, 'needs at least two rows to prove anything').toBeGreaterThan(1);
    expect(ascending).toEqual([...ascending].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
    await expect(page.locator('th', { hasText: 'Event' })).toHaveAttribute('aria-sort', 'ascending');

    await header.click();
    const descending = (await titles(page)).map((t) => t.trim());
    expect(descending).toEqual([...ascending].reverse());
    await expect(page.locator('th', { hasText: 'Event' })).toHaveAttribute('aria-sort', 'descending');
  });

  test('opens fill fullest-first and reverses on a second click', async ({ page }) => {
    /*
     * Read from the meter's ARIA values, not its label. The label renders "Full" or "N left",
     * so parsing digits out of it returned 0 for every row — which is why the first version
     * of this test passed with the sort function stubbed out to return its input.
     */
    const ratios = () =>
      page.locator('tbody tr').evaluateAll((rows) =>
        rows.map((row) => {
          const meter = row.querySelector('[role="meter"]');
          const confirmed = Number(meter?.getAttribute('aria-valuenow') ?? 0);
          const capacity = Number(meter?.getAttribute('aria-valuemax') ?? 0);
          return capacity > 0 ? confirmed / capacity : 0;
        }),
      );
    const header = page.getByRole('button', { name: 'Fill' });

    await header.click();
    const descending = await ratios();
    await expect(page.locator('th', { hasText: 'Fill' })).toHaveAttribute('aria-sort', 'descending');

    await header.click();
    const ascending = await ratios();
    await expect(page.locator('th', { hasText: 'Fill' })).toHaveAttribute('aria-sort', 'ascending');

    /*
     * Three guards, each earning its keep. Asserting only "descending is sorted" passed with
     * the sort stubbed out to return its input, because this venue's rows happen to arrive
     * fullest-first; and rows all equally full would satisfy any ordering. The two
     * directions must also differ, which is what catches a sort that never ran.
     *
     * Not asserted: that one direction is the exact reverse of the other. The sort is
     * stable, so rows with the same fill keep the server's order in both directions, and
     * tied rows are normal here.
     */
    // Data-dependent, so it says so rather than failing: other specs add and cancel events
    // for this venue, and a run where every event is equally full proves nothing either way.
    test.skip(
      descending.length < 2 || new Set(descending).size < 2,
      'this venue has no two events with different fills in this run',
    );
    expect(descending).toEqual([...descending].sort((a, b) => b - a));
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
    expect(ascending, 'the two directions must differ, or nothing sorted').not.toEqual(descending);
  });
});

test.describe('a venue cannot reach another venue data', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await appIsReady(page)), 'the app is not reachable');
    await signIn(page, OWNERS.ritual);
  });

  test('an event id this venue does not own is not found', async ({ page }) => {
    await page.goto('/business/events/00000000-0000-0000-0000-000000000000/edit');
    await expect(page.getByRole('heading', { name: /could not find that/i })).toBeVisible();
  });

  /**
   * A mistyped or truncated URL used to render the error screen instead: the value reached
   * Postgres, which rejects a malformed uuid with 22P02, and the store can only report that
   * as an internal failure. The pages check the shape before looking anything up.
   */
  test('a malformed id is not found rather than an error', async ({ page }) => {
    for (const path of [
      '/business/events/not-a-uuid/edit',
      '/business/events/not-a-uuid/attendees',
      '/business/proposals/not-a-uuid',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: /could not find that/i }), path).toBeVisible();
      await expect(page.getByRole('heading', { name: /could not load/i }), path).toBeHidden();
    }
  });
});
