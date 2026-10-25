import { expect, test, type Browser } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { applyDemoUserScene1 } from '../fixtures/social/preferences';
import { CONSUMER, login, reseed } from './helpers';
import { openSettled, settle } from './support/social';

// The first request to a route compiles it in dev mode, which can take longer than 5s in CI.
const FIRST_REQUEST = { timeout: 20_000 };

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const IDEA = 'Beginner wheel-throwing night';

type Plan = { id: string; suggestions: Array<{ title: string }> };

/** A second member backs the idea through the vote route, so 2 of 4 members (50%) have voted. */
async function voteAs(browser: Browser, email: string, groupId: string, planId: string, suggestionIndex: number): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email);
  const res = await context.request.post(`/api/groups/${groupId}/plans/${planId}/vote`, { data: { suggestionIndex } });
  expect(res.ok()).toBe(true);
  await context.close();
}

test('P1: a voted venue idea goes to 04 as a group-originated proposal', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await reseed(page);
  await applyDemoUserScene1(admin());
  await login(page, CONSUMER.email);
  const { data: groups } = (await (await page.request.get('/api/groups')).json()) as { data: Array<{ id: string; name: string }> };
  const groupId = groups.find((g) => g.name === 'Mission Makers')!.id;

  const planButton = page.getByRole('button', { name: 'Plan something for us' });
  await openSettled(page, `/groups/${groupId}`, planButton);
  await planButton.click();
  const idea = page.getByRole('region', { name: 'Suggestions' }).getByRole('article').filter({ hasText: IDEA });
  await settle(page, idea);
  await idea.getByRole('button', { name: /0 votes/ }).click();
  await settle(page, idea.getByRole('button', { name: /1 vote/ }));
  await expect(idea.getByRole('button', { name: /1 vote/ })).toHaveAttribute('aria-pressed', 'true');

  const { data: detail } = (await (await page.request.get(`/api/groups/${groupId}`)).json()) as { data: { latestPlan: Plan } };
  const index = detail.latestPlan.suggestions.findIndex((s) => s.title === IDEA);
  await voteAs(browser, 'leo@commonground.test', groupId, detail.latestPlan.id, index);

  const requestVenue = idea.getByRole('button', { name: 'Request venue' });
  await page.reload();
  await settle(page, requestVenue);
  await requestVenue.click();
  await expect(page.getByText(/^Sent to .+\. They’ll decide whether to host it\.$/)).toBeVisible(FIRST_REQUEST);
  const { data: proposals } = await admin()
    .from('event_proposals')
    .select('id, source, business_id')
    .eq('source_group_id', groupId)
    .eq('source_plan_id', detail.latestPlan.id)
    .eq('source_suggestion_index', index);
  expect(proposals).toHaveLength(1);
  expect(proposals![0]).toMatchObject({ source: 'group' });
});
