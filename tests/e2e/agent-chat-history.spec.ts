import { expect, test } from "@playwright/test";
import { CONSUMER, login, reseed } from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await reseed(page);
  await page.close();
});

/** The agent remembers the conversation: a reload shows earlier messages and cards, and new ones continue it. */
test("the /agent chat survives a reload and continues the same conversation", async ({ page }) => {
  await reseed(page);
  await login(page, CONSUMER.email);
  await page.goto("/agent");
  const log = page.getByRole("region", { name: "Chat with your agent" });

  await page.getByPlaceholder("Message your agent").fill("Who should I meet this week?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator('a[href^="/match?focus="]').first()).toBeVisible();

  await page.reload();
  await expect(log.getByText("Who should I meet this week?")).toBeVisible();
  await expect(page.locator('a[href^="/match?focus="]').first()).toBeVisible();

  await page.getByPlaceholder("Message your agent").fill("Any events too?");
  const sent = page.waitForResponse((r) => r.url().endsWith("/api/agent/chat") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Send" }).click();
  expect((await sent).ok()).toBe(true);
  await expect(log.getByText("Any events too?")).toBeVisible();
  const history = (await (await page.request.get("/api/agent/chat")).json()).data;
  expect(history.messages.filter((m: { role: string }) => m.role === "user").map((m: { content: string }) => m.content)).toEqual([
    "Who should I meet this week?",
    "Any events too?",
  ]);
});
