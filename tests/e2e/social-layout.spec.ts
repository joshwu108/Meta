import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { applyDemoUserScene1 } from '../fixtures/social/preferences';
import { CONSUMER, login, reseed } from './helpers';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// Design-system §7 checklist: every screen at these widths in both themes, no sideways scroll (§3).
const WIDTHS = [320, 768, 1024, 1440] as const;
const THEMES = ['light', 'dark'] as const;

/** Every 03 screen and tab, using Maya's seeded "Mission Makers" group for the group page. */
async function screenPaths(page: Page): Promise<string[]> {
  const { data } = (await (await page.request.get('/api/groups')).json()) as { data: Array<{ id: string; name: string }> };
  const group = data.find((g) => g.name === 'Mission Makers');
  expect(group, 'seeded group Mission Makers').toBeDefined();
  const base = `/groups/${group!.id}`;
  return ['/match', '/match?tab=requests', '/match?tab=connections', '/groups', '/groups/discover', base, `${base}?tab=events`, `${base}?tab=members`];
}

test.beforeEach(async ({ page }) => {
  await reseed(page);
  await applyDemoUserScene1(admin());
});

for (const theme of THEMES) {
  test(`03 screens fit every checklist width in ${theme}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
    await login(page, CONSUMER.email);
    for (const path of await screenPaths(page)) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect.soft(overflow, `${path} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
        await testInfo.attach(`${theme} ${width}px ${path}`, { body: await page.screenshot(), contentType: 'image/png' });
      }
    }
  });
}
