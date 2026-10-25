import { expect, test } from "@playwright/test";
import { NEW_USER, login, reseed } from "./helpers";

test.describe.configure({ mode: "serial" });

/** Full stack with only the chat route forced to AI_UNAVAILABLE, as if the model were down. */
test("onboarding falls back to the form when the AI is unavailable", async ({ page }) => {
  await reseed(page);
  await login(page, NEW_USER.email);
  await page.route("**/api/agent/chat", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { code: "AI_UNAVAILABLE", message: "The assistant is unavailable right now" } }),
    }),
  );
  await page.goto("/onboarding");
  await page.getByPlaceholder(/start typing/i).fill("Castro");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByPlaceholder("Message your agent").fill("I like hiking");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "unavailable" })).toBeVisible();
  await page.getByRole("button", { name: "Fill in a form instead" }).click();
  await expect(page.getByRole("heading", { name: "Does this look right?" })).toBeVisible();
  await expect(page.getByText("None yet")).toHaveCount(2);
});
