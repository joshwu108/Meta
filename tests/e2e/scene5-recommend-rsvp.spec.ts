import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Scene 5: the published pottery event leads Discover with an explanation; RSVP with sharing on;
// Activity lists it. Runs after Scenes 1 and 4 in the demo order: the Scene 1 user needs preferences
// and "Beginner Pottery & Coffee Night" exists only once 05 has published it.
// The Scene 1 user carries on into Scene 5 (01 seeds demo.new@ with no preferences).
const DEMO_EMAIL = process.env.E2E_DEMO_EMAIL ?? "demo.new@commonground.test";
const TITLE = "Beginner Pottery & Coffee Night";

test("Discover leads with the pottery night, RSVP with sharing, Activity shows it", async ({ page }) => {
  await login(page, DEMO_EMAIL);
  await page.goto("/discover");

  const lead = page.getByRole("link", { name: `For you: ${TITLE}` });
  await expect(lead).toBeVisible();
  await expect(lead.getByText("AI suggestion")).toBeVisible();

  await lead.click();
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Before you RSVP" });
  const shareWithAttendees = sheet.getByRole("switch", { name: "Share my name with other attendees" });
  if ((await shareWithAttendees.getAttribute("aria-checked")) !== "true") await shareWithAttendees.click();
  await sheet.getByRole("button", { name: "Confirm RSVP" }).click();
  await expect(page.getByRole("button", { name: "Cancel RSVP" })).toBeVisible();

  await page.goto("/activity");
  const upcoming = page.getByRole("region", { name: "Upcoming" });
  await expect(upcoming.getByText(TITLE)).toBeVisible();
});
