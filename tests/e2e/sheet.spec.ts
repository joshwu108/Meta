import { expect, test } from '@playwright/test';

test('Sheet traps focus and returns it to the trigger', async ({ page }) => {
  await page.goto('/dev/theme?theme=light');
  const trigger = page.getByRole('button', { name: 'Open sheet' });
  await trigger.focus();
  await trigger.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Edit price' });
  await expect(dialog).toBeVisible();
  // Initial focus lands inside the dialog (its first focusable: the Close button).
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  // Tab wraps: Close → Save → back to Close.
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeFocused();
  // Escape closes and focus returns to the trigger.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('Sheet with an autoFocus field still returns focus to the trigger', async ({ page }) => {
  await page.goto('/dev/theme?theme=light');
  const trigger = page.getByRole('button', { name: 'Open form sheet' });
  await trigger.focus();
  await trigger.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Rename group' });
  await expect(dialog.getByLabel('Group name')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
