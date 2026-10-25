import { expect, test } from '@playwright/test';
import { CONSUMER, NEW_USER, OWNER, login, reseed } from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  const res = await request.post('/api/dev/seed');
  expect(res.ok()).toBeTruthy();
});

test('signup with adult confirmation redirects to onboarding', async ({ page }) => {
  const email = `e2e-${Date.now()}@commonground.test`;
  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: 'Find your people' })).toBeVisible();
  await page.getByLabel('Display name').fill('E2E Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('e2e-pass-1234');
  await page.getByLabel(/18 or older/).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/onboarding');
  await expect(page.getByRole('heading', { name: /Hi E2E Tester/ })).toBeVisible();
});

test('login as a seeded consumer lands on discover with the consumer shell', async ({ page }) => {
  await login(page, CONSUMER.email);
  await expect(page).toHaveURL(/\/discover$/);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  for (const label of ['Discover', 'Match', 'Groups', 'Events', 'Agent', 'Activity']) {
    await expect(nav.getByRole('link', { name: label })).toBeVisible();
  }
  await expect(page.getByRole('img', { name: CONSUMER.name })).toBeVisible();
});

test('a user without onboarding is sent to /onboarding and sees the agent onboarding', async ({ page }) => {
  await reseed(page);
  await login(page, NEW_USER.email);
  await expect(page).toHaveURL(/\/onboarding$/);
  // ws02's onboarding replaced 01's placeholder skip button; finishing it is covered by agent-scene1.spec.ts.
  await expect(page.getByRole('heading', { name: `Hi ${NEW_USER.name}, welcome to CommonGround` })).toBeVisible();
});

test('a seeded business owner is routed to the business side', async ({ page }) => {
  await login(page, OWNER.email);
  // /business once workstream 05's businesses table exists; /business/onboarding until then.
  await expect(page).toHaveURL(/\/business(\/onboarding)?$/);
});

test('unauthenticated API calls get the UNAUTHENTICATED envelope', async ({ request }) => {
  const res = await request.get('/api/me');
  expect(res.status()).toBe(401);
  expect(await res.json()).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
});
