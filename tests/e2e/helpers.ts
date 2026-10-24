import type { Page } from '@playwright/test';

export const SEED_PASSWORD = 'demo-pass-1234';
export const CONSUMER = { email: 'maya@commonground.test', name: 'Maya Chen' };
export const NEW_USER = { email: 'demo.new@commonground.test', name: 'Jordan Lee' };
export const OWNER = { email: 'owner.kiln-and-cup@commonground.test', name: 'Rosa Delgado' };

export async function login(page: Page, email: string, password = SEED_PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** Reload the demo dataset through the dev route so every spec starts from the same state. */
export async function reseed(page: Page): Promise<void> {
  const res = await page.request.post('/api/dev/seed');
  if (!res.ok()) throw new Error(`seed failed: ${res.status()} ${await res.text()}`);
}
