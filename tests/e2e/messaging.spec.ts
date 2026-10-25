import { expect, test } from '@playwright/test';
import { login, reseed } from './helpers';
import { openSettled } from './support/social';

// The first request to a route compiles it in dev mode, which can take longer than 5s in CI.
const FIRST_REQUEST = { timeout: 20_000 };

test('accepted connections can message each other (P1, polled)', async ({ page, browser }) => {
  test.setTimeout(90_000);
  await reseed(page);
  await login(page, 'maya@commonground.test');
  const messageLeo = page.getByRole('region', { name: 'Your connections' }).getByRole('listitem').filter({ hasText: 'Leo Park' }).getByRole('button', { name: 'Message' });
  await openSettled(page, '/match?tab=connections', messageLeo);
  await messageLeo.click();
  const chat = page.getByRole('dialog', { name: 'Leo Park' });
  await chat.getByRole('textbox', { name: 'Message' }).fill('Wheel night on Thursday?');
  await chat.getByRole('button', { name: 'Send' }).click();
  await expect(chat.getByRole('list', { name: 'Messages with Leo Park' })).toContainText('Wheel night on Thursday?', FIRST_REQUEST);

  const leo = await browser.newContext();
  const leoPage = await leo.newPage();
  await login(leoPage, 'leo@commonground.test');
  const messageMaya = leoPage.getByRole('region', { name: 'Your connections' }).getByRole('listitem').filter({ hasText: 'Maya Chen' }).getByRole('button', { name: 'Message' });
  await openSettled(leoPage, '/match?tab=connections', messageMaya);
  await messageMaya.click();
  // The chat's first poll can take longer than 5s under dev-server load (seen by 01 in a full run).
  await expect(leoPage.getByRole('list', { name: 'Messages with Maya Chen' })).toContainText('Wheel night on Thursday?', FIRST_REQUEST);
  await leo.close();
});
