import { expect, test, type Browser } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { applyDemoUserScene1 } from '../fixtures/social/preferences';
import { NEW_USER, login, reseed } from './helpers';
import { openSettled, settle } from './support/social';

// The first request to a route compiles it in dev mode, which can take longer than 5s in CI.
const FIRST_REQUEST = { timeout: 20_000 };

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const GROUP_NAME = 'Thursday Makers';

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

/** "Second seeded user accepts via API": sign in as them and answer the invitation through the route. */
async function acceptInvitationAs(browser: Browser, email: string): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email);
  const list = await (await context.request.get('/api/groups')).json();
  const group = list.data.find((g: { name: string }) => g.name === GROUP_NAME);
  expect(group).toMatchObject({ myStatus: 'invited' });
  const res = await context.request.patch(`/api/invitations/${group.invitationId}`, { data: { status: 'accepted' } });
  expect(res.ok()).toBe(true);
  await context.close();
}

/** The request reaches Maya through 01's bell; opening it while `/match` is already open selects the Requests tab. */
async function openRequestFromBell(browser: Browser): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, 'maya@weave.test');
  const recommended = page.getByRole('tab', { name: /Recommended/ });
  await openSettled(page, '/match', recommended);
  await expect(recommended).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await page.getByRole('dialog', { name: 'Notifications' }).getByRole('link', { name: new RegExp(`${NEW_USER.name} wants to connect`) }).click();
  await page.waitForURL(/\/match\?tab=requests$/);
  const request = page.getByRole('region', { name: 'Incoming' }).getByRole('listitem').filter({ hasText: NEW_USER.name });
  await settle(page, request.getByRole('button', { name: 'Accept' }));
  await expect(page.getByRole('tab', { name: /Requests/ })).toHaveAttribute('aria-selected', 'true');
  await context.close();
}

test('Scene 2: matches with explanations, connect, create a private group, invite, accept', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await reseed(page);
  const admin = adminClient();
  await applyDemoUserScene1(admin);

  await login(page, NEW_USER.email);
  const cards = page.getByRole('list', { name: 'Recommended people' }).getByRole('article');
  await openSettled(page, '/match', cards.first());
  expect(await cards.count()).toBeGreaterThanOrEqual(3);
  for (const index of [0, 1, 2]) {
    const card = cards.nth(index);
    await expect(card.getByText('AI suggestion')).toBeVisible();
    await expect(card).toContainText(/You both like|free Thursday/);
  }
  await expect(cards.first()).toHaveAccessibleName(/Top match: Maya Chen/);

  await cards.first().getByRole('button', { name: 'Connect' }).click();
  const connect = page.getByRole('dialog', { name: 'Connect with Maya Chen' });
  await expect(connect.getByLabel('Add a note (optional)')).toBeFocused();
  await connect.getByLabel('Add a note (optional)').fill('Pottery on Thursday?');
  await connect.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('Request sent to Maya Chen')).toBeVisible(FIRST_REQUEST);
  await expect(page.getByRole('article', { name: /Maya Chen/ })).toHaveCount(0);
  await expect(page.getByRole('tabpanel', { name: 'Recommended' })).toBeFocused();
  await openRequestFromBell(browser);

  const createGroup = page.getByRole('button', { name: 'Create group' });
  await openSettled(page, '/groups', createGroup);
  await createGroup.click();
  const create = page.getByRole('dialog', { name: 'Create a group' });
  await create.getByLabel('Name').fill(GROUP_NAME);
  await create.getByLabel('Interests').fill('pottery');
  await create.getByLabel('Interests').press('Enter');
  await expect(create.getByRole('radio', { name: /Private/ })).toBeChecked();
  await create.getByRole('button', { name: 'Create group' }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}\?tab=members/);
  await settle(page, page.getByLabel('Invite Maya Chen'));
  await expect(page.getByRole('heading', { name: GROUP_NAME })).toBeVisible();

  await page.getByLabel('Invite Maya Chen').check();
  await page.getByLabel('Invite Yuki Tanaka').check();
  await page.getByRole('button', { name: 'Invite 2' }).click();
  await expect(page.getByText('Invited 2 people')).toBeVisible(FIRST_REQUEST);

  await acceptInvitationAs(browser, 'yuki@weave.test');

  await page.reload();
  await settle(page, page.getByRole('heading', { name: 'Members · 2' }));
  const roster = page.getByRole('region', { name: 'Members · 2' });
  await expect(roster.getByText('Yuki Tanaka')).toBeVisible();
  await expect(roster.getByText(/Jordan Lee/)).toBeVisible();
});
