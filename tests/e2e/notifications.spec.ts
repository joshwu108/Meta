import { expect, test } from '@playwright/test';
import { CONSUMER, login, reseed } from './helpers';

test('notification bell shows the unread count and marks items read', async ({ page }) => {
  await reseed(page);
  await login(page, CONSUMER.email);
  const bell = page.getByTestId('notification-bell');
  await expect(bell).toBeVisible();
  await expect(page.getByTestId('notification-unread')).toHaveText('1');
  await bell.click();
  const dialog = page.getByRole('dialog', { name: 'Notifications' });
  await expect(dialog.getByText("You're invited to Thursday Night Crew")).toBeVisible();
  await dialog.getByRole('button', { name: /Thursday Night Crew/ }).click();
  await expect(page.getByTestId('notification-unread')).toHaveCount(0);
});
