import { expect, test, type Page } from "@playwright/test";
import extract from "../../src/lib/ai/fixtures/agent.extract_preferences.json";

/**
 * Scene 1, UI path. API routes are intercepted with the same MOCK_AI fixture the
 * server uses, so this runs without Supabase. The full-stack variant (real auth +
 * DB) runs once 01's shell and the local stack exist.
 */
const SCENE_1 = "I just moved here, I like pottery and coffee shops, free Thursday evenings, small groups.";
const { cases: _cases, ...scene } = extract;
void _cases;

async function mockApi(page: Page) {
  const prefs = {
    interests: [] as string[], interestCategories: [] as string[], availabilitySlots: [] as string[], socialGoals: [] as string[],
    groupSizePref: null as string | null, budgetMinCents: null, budgetMaxCents: null, travelRadiusKm: 5,
    activityPrefs: [] as string[], dealbreakers: [] as string[], fieldSources: {} as Record<string, string>,
  };
  const calls: { path: string; body: unknown }[] = [];
  const json = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const body = req.postData() ? JSON.parse(req.postData()!) : undefined;
    calls.push({ path, body });
    if (path === "/api/users/onboard") return route.fulfill(json({ ok: true }));
    if (path === "/api/agent/chat") {
      Object.assign(prefs, {
        interests: scene.interests.map((i) => i.tag), interestCategories: scene.interestCategories,
        availabilitySlots: scene.availabilitySlots, socialGoals: scene.socialGoals, groupSizePref: scene.groupSizePref,
        activityPrefs: scene.activityPrefs,
        fieldSources: { interests: "ai_inferred", availabilitySlots: "ai_inferred", groupSizePref: "ai_inferred" },
      });
      return route.fulfill(json({ conversationId: "c1", reply: "Here's what I heard: pottery, coffee, Thursday evenings, small groups. Take a look and adjust anything I got wrong.", extracted: scene, done: true }));
    }
    if (path === "/api/agent/preferences" && req.method() === "PATCH") {
      Object.assign(prefs, body, { fieldSources: { ...prefs.fieldSources, ...Object.fromEntries(Object.keys(body).map((k) => [k, "user_set"])) } });
      return route.fulfill(json(prefs));
    }
    if (path === "/api/agent/preferences") return route.fulfill(json(prefs));
    if (path === "/api/agent/preferences/confirm") return route.fulfill(json({ ok: true }));
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: path } }) });
  });
  return calls;
}

test("Scene 1: canonical sentence → review shows pottery, coffee, Thursday evening, small → confirm → Discover", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto("/onboarding");

  await page.getByPlaceholder(/start typing/i).fill("Mission District");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByPlaceholder("Message your agent").fill(SCENE_1);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Here's what I heard/)).toBeVisible();
  await page.getByRole("button", { name: "Review my profile" }).click();

  await expect(page.getByRole("heading", { name: "Does this look right?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove pottery" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove coffee" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thu evening" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("radio", { name: "Small (3–6)" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("No limit set")).toBeVisible();
  await expect(page.getByText("AI inferred").first()).toBeVisible();

  await page.getByRole("button", { name: "Remove coffee" }).click();
  await expect(page.getByRole("button", { name: "Remove coffee" })).toHaveCount(0);
  expect(calls.find((c) => c.path === "/api/agent/preferences" && c.body)?.body).toEqual({ interests: ["pottery"] });

  await page.getByRole("switch", { name: "Match me with people" }).click();
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await page.waitForURL("**/discover");
  const confirm = calls.find((c) => c.path === "/api/agent/preferences/confirm");
  expect(confirm?.body).toMatchObject({ discoverable: true, consent: { allow_matching: true, allow_demand_aggregation: false } });
});
