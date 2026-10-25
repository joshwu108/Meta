import { expect, test } from '@playwright/test';
import { login, reseed } from './helpers';

test('accepted connections can message each other (P1, polled)', async ({ page, browser }) => {
  test.setTimeout(90_000);
  await reseed(page);
  await login(page, 'maya@commonground.test');
  await page.goto('/match?tab=connections');
  const connections = page.getByRole('region', { name: 'Your connections' });
  await connections.getByRole('listitem').filter({ hasText: 'Leo Park' }).getByRole('button', { name: 'Message' }).click();
  const chat = page.getByRole('dialog', { name: 'Leo Park' });
  await chat.getByRole('textbox', { name: 'Message' }).fill('Wheel night on Thursday?');
  await chat.getByRole('button', { name: 'Send' }).click();
  await expect(chat.getByRole('list', { name: 'Messages with Leo Park' })).toContainText('Wheel night on Thursday?');

  const leo = await browser.newContext();
  const leoPage = await leo.newPage();
  await login(leoPage, 'leo@commonground.test');
  await leoPage.goto('/match?tab=connections');
  await leoPage.getByRole('region', { name: 'Your connections' }).getByRole('listitem').filter({ hasText: 'Maya Chen' }).getByRole('button', { name: 'Message' }).click();
  await expect(leoPage.getByRole('list', { name: 'Messages with Maya Chen' })).toContainText('Wheel night on Thursday?');
  await leo.close();
});
