import { expect, test } from '@playwright/test';
import { OWNERS, appIsReady, signIn } from './support/business';

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

    const row = page.getByRole('listitem').filter({ hasText: title });
    await expect(row.getByText('Draft')).toBeVisible();
    await expect(row.getByText('$18')).toBeVisible();

    // Edit, then publish from the editor.
    await row.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByRole('heading', { name: 'Edit event' })).toBeVisible();
    await page.getByLabel('Capacity').fill('12');
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForURL(/\/business\/events$/);

    await page.getByRole('listitem').filter({ hasText: title }).getByRole('link', { name: 'Edit' }).click();
    // Wait for the editor: the table rows carry a Publish button of their own now.
    await expect(page.getByRole('heading', { name: 'Edit event' })).toBeVisible();
    await page.getByRole('button', { name: /^publish$/i }).click();
    await page.waitForURL(/\/business\/events$/);

    const published = page.getByRole('listitem').filter({ hasText: title });
    await expect(published.getByText('Published')).toBeVisible();
    await expect(published.getByText('0/12')).toBeVisible();

    // The dashboard counts it as upcoming.
    await page.goto('/business');
    await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible();

    // Attendees: counts first, nobody has RSVP'd yet.
    await page.goto('/business/events');
    await page
      .getByRole('listitem')
      .filter({ hasText: title })
      .getByRole('link', { name: 'Attendees' })
      .click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('No confirmed attendees yet.')).toBeVisible();

    // Cancelling needs a reason.
    await page.goto('/business/events');
    await page.getByRole('listitem').filter({ hasText: title }).getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByRole('heading', { name: 'Edit event' })).toBeVisible();
    await page.getByRole('button', { name: /cancel event/i }).first().click();
    await page.getByLabel('Reason').fill('The kiln needs repairing');
    await page.getByRole('button', { name: /cancel event/i }).last().click();
    await page.waitForURL(/\/business\/events$/);

    await expect(
      page.getByRole('listitem').filter({ hasText: title }).getByText('Cancelled'),
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

    const row = () => page.getByRole('listitem').filter({ hasText: title });
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

  test('another venue event is not reachable by url', async ({ page }) => {
    await signIn(page, OWNERS.ritual);
    await page.goto('/business/events/00000000-0000-0000-0000-000000000000/edit');
    await expect(page.getByRole('heading', { name: /could not find that/i })).toBeVisible();
  });
});
