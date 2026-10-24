import { expect, test, type BrowserContext } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

/** Signs in through @supabase/ssr in Node and copies the session cookies it writes into the browser. */
async function signIn(context: BrowserContext, baseURL: string, email: string, password: string): Promise<void> {
  const written: Array<{ name: string; value: string }> = [];
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => [], setAll: (cookies: Array<{ name: string; value: string }>) => {
      written.push(...cookies.map(({ name, value }) => ({ name, value })));
    } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in failed: ${error.message}`);
  await context.addCookies(written.map((c) => ({ ...c, url: baseURL, sameSite: 'Lax' as const })));
}

test.describe('Scene 3: Generate Opportunities', () => {
  let admin: SupabaseClient;
  let cleanup: () => Promise<void> = async () => undefined;

  test.beforeAll(async () => {
    const helpers = await import('../integration/helpers');
    const scene3 = await import('../integration/demand/scene3');
    admin = helpers.adminClient() as unknown as SupabaseClient;
    scene3.applyTestSchema();
    await helpers.cleanupTestUsers(admin as never);
    await admin.from('event_proposals').delete().not('id', 'is', null);
    await admin.from('opportunity_runs').delete().not('id', 'is', null);
    await scene3.seedScene3(admin);
    cleanup = async () => {
      await admin.from('event_proposals').delete().not('id', 'is', null);
      await admin.from('opportunity_runs').delete().not('id', 'is', null);
      await helpers.cleanupTestUsers(admin as never);
    };
  });

  test.afterAll(async () => cleanup());

  test('operator clicks Generate, the tracker completes and the pottery proposal is listed', async ({ page, context, baseURL }) => {
    const email = `presenter-${Date.now()}@itest.commonground.test`;
    const password = 'itest-pass-1234';
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Presenter', is_adult_confirmed: true } });
    expect(created.error).toBeNull();
    await signIn(context, baseURL!, email, password);

    await page.goto('/admin/opportunities');
    await expect(page.getByRole('heading', { name: 'Community opportunities' })).toBeVisible();
    await page.getByRole('button', { name: 'Generate Opportunities' }).click();

    const tracker = page.getByRole('list', { name: 'Run progress' });
    await expect(tracker).toBeVisible();
    await expect(tracker.locator('li[data-state="done"]')).toHaveCount(5, { timeout: 30_000 });

    const results = page.getByRole('region', { name: 'Results' });
    const pottery = results.getByRole('row').filter({ hasText: 'Beginner Pottery & Coffee Night' });
    await expect(pottery).toHaveCount(1);
    await expect(pottery).toContainText('Kiln & Cup');
    await expect(pottery).toContainText('6–9 interested');
    await expect(pottery).toContainText('Creative · Thu evening');
    await expect(results.getByRole('row').filter({ hasText: 'Meeple House' })).toHaveCount(1);
    await expect(page.getByText(/small cohorts? suppressed/)).toBeVisible();
  });
});
