import { expect, test, type Page } from "@playwright/test";
import { NEW_USER, login, reseed } from "./helpers";

/**
 * Scene 1b (workstream 07), full stack with MOCK_AI: onboarding chat → "Bring in your Instagram
 * taste" → upload a synthetic screenshot → review → only approved items reach Review.
 */
const SCENE_1 = "I just moved here, I like pottery and coffee shops, free Thursday evenings, small groups.";
const SCREENSHOT = "tests/fixtures/import/your-algorithm-synthetic.png";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await reseed(page);
});

async function chatThenImport(page: Page) {
  await login(page, NEW_USER.email);
  await page.goto("/onboarding");
  await page.getByPlaceholder(/start typing/i).fill("Mission District");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByPlaceholder("Message your agent").fill(SCENE_1);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/I heard/).first()).toBeVisible();
  await page.getByRole("button", { name: "Bring in your Instagram taste" }).click();
  await expect(page.getByRole("heading", { name: "Want help finding more?" })).toBeVisible();
}

test("Scene 1b: screenshot → Love it / Yes / Not me / Keep as a dislike → Review shows only approved chips", async ({ page }) => {
  await chatThenImport(page);
  await expect(page.getByText(/aren’t stored/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send to my agent" })).toBeDisabled();

  const uploads: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/import/screens")) uploads.push(req.headers()["content-type"] ?? "");
  });
  await page.locator("#import-files").setInputFiles(SCREENSHOT);
  await expect(page.getByRole("img", { name: /Preview of/ })).toBeVisible();
  await page.getByRole("button", { name: "Send to my agent" }).click();

  await expect(page.getByRole("heading", { name: "Interests" })).toBeVisible();
  expect(uploads).toHaveLength(1);
  expect(uploads[0]).toMatch(/multipart\/form-data/);
  await expect(page.getByText("AI suggestion").first()).toBeVisible();
  await expect(page.getByText(/Wellness|Ignore previous/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Love it: Ceramics" }).click();
  await page.getByRole("button", { name: "Yes: Board games" }).click();
  await page.getByRole("button", { name: "Not me: Hiking" }).click();
  await page.getByRole("button", { name: "Keep Horror movies as a dislike" }).click();
  await expect(page.getByText(/2 added · 2 dismissed/)).toBeVisible();

  // Nothing is saved before Done for now.
  let prefs = (await (await page.request.get("/api/agent/preferences")).json()).data;
  expect(prefs.interests).not.toContain("ceramics");
  await page.getByRole("button", { name: "Done for now" }).click();
  await expect(page.getByText(/Added 2 to your profile/)).toBeVisible();

  await page.getByRole("button", { name: "Back to review" }).click();
  await expect(page.getByRole("heading", { name: "Does this look right?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove ceramics" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove board-games" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove hiking" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove pottery" })).toBeVisible();

  prefs = (await (await page.request.get("/api/agent/preferences")).json()).data;
  expect(prefs.interests).toEqual(expect.arrayContaining(["pottery", "ceramics", "board-games"]));
  await page.getByRole("switch", { name: "Match me with people" }).click();
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await page.waitForURL("**/discover");

  // The plan: people, places and events the user acts on themselves.
  await page.goto("/agent/import");
  await expect(page.getByRole("heading", { name: "Your plan" })).toBeVisible();
  await expect(page.getByText(/Nothing is booked or sent/)).toBeVisible();
  const steps = page.locator('section[aria-labelledby="plan-title"] a');
  await expect(steps.first()).toBeVisible();
  const hrefs = await steps.evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  expect(hrefs.some((h) => h.startsWith("/events/") || h.startsWith("/match?focus=") || h === "/places")).toBe(true);
  const hello = page.getByRole("link", { name: "Say hello" });
  if (await hello.count()) {
    await hello.click();
    await page.waitForURL(/\/match\?focus=/);
  }
});

test("Skip leaves onboarding unchanged", async ({ page }) => {
  await chatThenImport(page);
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("heading", { name: "Does this look right?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove pottery" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove ceramics" })).toHaveCount(0);
  const pending = await page.request.get("/api/import/suggestions");
  expect((await pending.json()).data).toEqual([]);
});
