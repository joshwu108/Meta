import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Scene 6: the seeded completed "Latte Art & Conversation" already holds maya → jordan interest;
// jordan picks maya, and both see the AI follow-up suggestion in Activity.
const EVENT = "Latte Art & Conversation";

test("mutual reconnect produces a follow-up suggestion for both people", async ({ page }) => {
  await login(page, "jordan@weave.test");
  await page.goto("/activity");
  await page.getByRole("region", { name: "Past events" }).getByText(EVENT).click();

  const reconnect = page.getByRole("region", { name: "Who would you like to see again?" });
  await reconnect.getByRole("listitem").filter({ hasText: /maya/i }).getByRole("button", { name: "See again" }).click();
  await expect(reconnect.getByText("It's mutual! Check Activity.")).toBeVisible();

  await page.goto("/activity");
  const followUps = page.getByRole("region", { name: "Follow-up suggestions" });
  await expect(followUps.getByText(/Your agents suggest/)).toBeVisible();
  await expect(followUps.getByText("AI suggestion")).toBeVisible();
  await followUps.getByRole("button", { name: "Accept" }).click();
  await expect(followUps.getByText(/Waiting for Maya/)).toBeVisible({ timeout: 20_000 });

  await page.context().clearCookies();
  await login(page, "maya@weave.test");
  await page.goto("/activity");
  const mayaFollowUps = page.getByRole("region", { name: "Follow-up suggestions" });
  await expect(mayaFollowUps.getByText(/jordan/i).first()).toBeVisible();
  await mayaFollowUps.getByRole("button", { name: "Accept" }).click();
  await expect(mayaFollowUps.getByText(/You're both in/)).toBeVisible({ timeout: 20_000 });
});
