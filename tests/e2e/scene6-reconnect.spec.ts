import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Scene 6: the seeded completed "Latte Art & Conversation" already holds maya → jordan interest;
// jordan picks maya, and both see the AI follow-up suggestion in Activity.
const EVENT = "Latte Art & Conversation";

test("mutual reconnect produces a follow-up suggestion for both people", async ({ page }) => {
  await login(page, "jordan@commonground.test");
  await page.goto("/activity");
  await page.getByRole("region", { name: "Past events" }).getByText(EVENT).click();

  const reconnect = page.getByRole("region", { name: "Who would you like to see again?" });
  await reconnect.getByRole("listitem").filter({ hasText: /maya/i }).getByRole("button", { name: "See again" }).click();
  await expect(reconnect.getByText("It's mutual! Check Activity.")).toBeVisible();

  await page.goto("/activity");
  const followUps = page.getByRole("region", { name: "Follow-up suggestions" });
  await expect(followUps.getByText(/Your agents suggest/)).toBeVisible();
  await expect(followUps.getByText("AI suggestion")).toBeVisible();

  await page.context().clearCookies();
  await login(page, "maya@commonground.test");
  await page.goto("/activity");
  await expect(page.getByRole("region", { name: "Follow-up suggestions" }).getByText(/jordan/i)).toBeVisible();
});
