import { expect, type Page } from "@playwright/test";

export const PASSWORD = "demo-pass-1234";

/** Signs in through 01's /login form (labels per 01 spec §5: email + password). */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function signOut(page: Page): Promise<void> {
  await page.context().clearCookies();
}
