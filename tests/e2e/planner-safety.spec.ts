import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { applyDemoUserScene1, applyInterimPreferences } from '../fixtures/social/preferences';
import { NEW_USER, login, reseed } from './helpers';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

test.beforeEach(async ({ page }) => {
  await reseed(page);
  await applyInterimPreferences(admin());
  await applyDemoUserScene1(admin());
});

test('AC4: the group planner suggests 2–4 activities in the shared slot and members can vote', async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, 'maya@commonground.test');
  await page.goto('/groups');
  await page.getByRole('link', { name: /Mission Makers/ }).first().click();
  await page.getByRole('textbox', { name: 'What should we do?' }).fill('Something creative on a weeknight with Leo');
  await page.getByRole('button', { name: 'Plan something for us' }).click();
  await expect(page.getByText('Based on 4 of 4 members who allow group planning')).toBeVisible();
  const suggestions = page.getByRole('region', { name: 'Suggestions' }).getByRole('article');
  await expect(suggestions.first()).toBeVisible();
  const count = await suggestions.count();
  expect(count).toBeGreaterThanOrEqual(2);
  expect(count).toBeLessThanOrEqual(4);
  for (let i = 0; i < count; i += 1) {
    await expect(suggestions.nth(i).getByText('AI suggestion')).toBeVisible();
    await expect(suggestions.nth(i)).toContainText('Thursday evenings');
  }
  await suggestions.first().getByRole('button', { name: /0 votes/ }).click();
  await expect(suggestions.first().getByRole('button', { name: /1 vote/ })).toHaveAttribute('aria-pressed', 'true');
});

test('Block and Report from a match card', async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, NEW_USER.email);
  await page.goto('/match');
  const card = page.getByRole('article', { name: /^Yuki Tanaka/ });
  const trigger = card.getByRole('button', { name: 'More options for Yuki Tanaka' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Block' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Report' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Block' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole('menuitem', { name: 'Report' }).click();
  const report = page.getByRole('dialog', { name: 'Report Yuki Tanaka' });
  await report.getByRole('radio', { name: 'Spam' }).check();
  await report.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText('Thanks. Your report was sent.')).toBeVisible();

  await trigger.click();
  await page.getByRole('menuitem', { name: 'Block' }).click();
  await page.getByRole('dialog', { name: 'Block Yuki Tanaka?' }).getByRole('button', { name: 'Block' }).click();
  await expect(page.getByText('Yuki Tanaka is blocked')).toBeVisible();
  await expect(page.getByRole('article', { name: /^Yuki Tanaka/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('list', { name: 'Recommended people' }).getByRole('article').first()).toBeVisible();
  await expect(page.getByRole('article', { name: /^Yuki Tanaka/ })).toHaveCount(0);
});

test('an agent deep link (/match?focus=) shows that person as the lead card', async ({ page }) => {
  test.setTimeout(60_000);
  const { data } = await admin().auth.admin.listUsers({ perPage: 200 });
  const ana = data.users.find((u) => u.email === 'ana@commonground.test')!;
  await login(page, NEW_USER.email);
  await page.goto(`/match?focus=${ana.id}`);
  const lead = page.getByRole('list', { name: 'Recommended people' }).getByRole('article').first();
  await expect(lead).toHaveAccessibleName(/^Suggested by your agent: Ana Souza/);
});
