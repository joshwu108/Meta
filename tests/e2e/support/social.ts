import { expect, type Locator, type Page } from '@playwright/test';

const SETTLE_TIMEOUT = 30_000;

/**
 * Wait for `ready` after a page load, navigation or refresh. On slow CI runners Next's dev server
 * sometimes fails to rebuild a server component's debug stack ("frame.join is not a function":
 * React drops the stack once its debug budget runs out, then crashes rebuilding it), and the
 * route's error boundary shows instead. Production builds send no such debug data, so reload
 * once; a real server error still fails on the second render. Resolves true when it reloaded
 * (focus and other client-only state are reset then).
 */
export async function settle(page: Page, ready: Locator): Promise<boolean> {
  const failed = page.getByRole('button', { name: 'Try again' });
  await expect(ready.or(failed).first()).toBeVisible({ timeout: SETTLE_TIMEOUT });
  if (!(await failed.isVisible())) return false;
  await page.reload();
  await expect(ready).toBeVisible({ timeout: SETTLE_TIMEOUT });
  return true;
}

/** Open `path` and wait for `ready` (see `settle`). */
export async function openSettled(page: Page, path: string, ready: Locator): Promise<boolean> {
  await page.goto(path);
  return settle(page, ready);
}
