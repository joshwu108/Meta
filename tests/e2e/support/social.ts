import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Open `path` and wait for `ready`. On slow CI runners Next's dev server sometimes fails to
 * rebuild a server component's debug stack ("frame.join is not a function": React drops the
 * stack once its debug budget runs out, then crashes rebuilding it), and the route's error
 * boundary shows instead. That never happens in production builds, so reload once; a real
 * server error still fails on the second render.
 */
export async function openSettled(page: Page, path: string, ready: Locator): Promise<void> {
  await page.goto(path);
  const failed = page.getByRole('button', { name: 'Try again' });
  await expect(ready.or(failed).first()).toBeVisible({ timeout: 30_000 });
  if (await failed.isVisible()) {
    await page.reload();
    await expect(ready).toBeVisible({ timeout: 30_000 });
  }
}
