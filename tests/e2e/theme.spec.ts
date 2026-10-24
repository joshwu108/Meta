import { expect, test } from '@playwright/test';

const WIDTHS = [320, 768, 1024, 1440] as const;
const THEMES = ['light', 'dark'] as const;

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`theme gallery ${theme} @ ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
      await page.goto(`/dev/theme?theme=${theme}`);
      await expect(page.getByTestId('theme-gallery')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(0);
      await expect(page).toHaveScreenshot(`gallery-${theme}-${width}.png`, { fullPage: true });
    });
  }
}
