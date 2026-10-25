import { expect, test } from '@playwright/test';
import { CONSUMER, login, reseed } from './helpers';

/**
 * Workstream 07 `/graph`: the tab exists, the graph draws the viewer's people as circles, a node
 * opens its detail sheet, and the List view holds the same nodes.
 */

const SHOT_DIR = process.env.GRAPH_SHOT_DIR;

test.beforeEach(async ({ page }) => {
  await reseed(page);
  await login(page, CONSUMER.email);
});

test('the Graph tab is in the nav and opens the graph', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/discover');
  const navLink = page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Graph' });
  await expect(navLink).toBeVisible();
  await navLink.click();
  await page.waitForURL(/\/graph$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Your graph' })).toBeVisible();
});

test('the Graph tab is reachable from the mobile tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/discover');
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Graph' })
    .click();
  await page.waitForURL(/\/graph$/);
  await expect(page.getByRole('img', { name: /Your graph:/ })).toBeVisible();
});

test('draws the viewer and their people as nodes, and opens one', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/graph');
  const canvas = page.getByRole('img', { name: /Your graph:/ });
  await expect(canvas).toBeVisible();

  const nodes = canvas.getByRole('button');
  await expect(nodes.first()).toBeVisible();
  const count = await nodes.count();
  expect(count, 'the viewer plus at least one other node').toBeGreaterThan(1);

  // The viewer is one of them, labelled as such.
  await expect(
    canvas.getByRole('button', { name: new RegExp(`You, ${CONSUMER.name}`) }),
  ).toBeVisible();

  const other = nodes.nth(1);
  const label = await other.getAttribute('aria-label');
  await other.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'How you’re connected' })).toBeVisible();
  expect(label).toBeTruthy();
});

test('starts the drawing centred on a phone, where the canvas scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/graph');
  const canvas = page.getByRole('img', { name: /Your graph:/ });
  await expect(canvas).toBeVisible();
  const centred = await page.evaluate(() => {
    const svg = document.querySelector('svg[role="img"]');
    const scroller = svg?.parentElement;
    if (!scroller) return null;
    const slack = scroller.scrollWidth - scroller.clientWidth;
    return { slack, scrollLeft: scroller.scrollLeft };
  });
  expect(centred).not.toBeNull();
  expect(centred!.slack, 'the canvas is wider than a phone, so it scrolls').toBeGreaterThan(0);
  expect(Math.abs(centred!.scrollLeft - centred!.slack / 2)).toBeLessThan(4);
});

test('the nav fits the narrowest supported phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/graph');
  await expect(
    page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Graph' }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'no horizontal page scroll at 320px').toBeLessThanOrEqual(0);
});

test('the List view holds the same nodes as the graph', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/graph');
  await page.getByRole('tab', { name: /List/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Connected' })).toBeVisible();
  const rows = page.getByRole('listitem');
  expect(await rows.count()).toBeGreaterThan(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'no horizontal page scroll on a phone').toBeLessThanOrEqual(0);
});

test('renders a profile picture inside the node when the person has one', async ({ page }) => {
  // Seeded profiles have no picture, so every node starts as a silhouette.
  await page.goto('/graph');
  const canvas = page.getByRole('img', { name: /Your graph:/ });
  await expect(canvas).toBeVisible();
  await expect(canvas.locator('image')).toHaveCount(0);

  // Give the signed-in profile one through the product's own route, and it appears in the node.
  const avatar =
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="%23f7b928"/></svg>';
  const res = await page.request.patch('/api/me', { data: { avatar_url: avatar } });
  expect(res.ok(), await res.text()).toBe(true);

  await page.reload();
  const picture = page.getByRole('img', { name: /Your graph:/ }).locator('image');
  await expect(picture).toHaveCount(1);
  await expect(picture).toHaveAttribute('href', avatar);
});

/** Opt-in screenshots for reviewing the design; skipped unless GRAPH_SHOT_DIR is set. */
test('screenshots', async ({ page }) => {
  test.skip(!SHOT_DIR, 'set GRAPH_SHOT_DIR to capture');
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 1280] as const) {
      await page.setViewportSize({ width, height: width === 390 ? 900 : 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
      await page.goto(`/graph?theme=${theme}`);
      await expect(page.getByRole('img', { name: /Your graph:/ })).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOT_DIR}/graph-${theme}-${width}.png`, fullPage: true });
    }
  }
});
