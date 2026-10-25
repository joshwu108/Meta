import { expect, test } from "@playwright/test";
import { CONSUMER, login } from "./helpers";

// Scene 5. On a fresh seed (CI) the pottery night does not exist yet: 05 publishes it in Scene 4 and
// personalisation needs 02's Scene 1 preferences. The RSVP flow therefore runs on any open seeded
// event; the pottery-night lead is asserted only when that event exists (the full demo order).
const POTTERY = "Beginner Pottery & Coffee Night";

type Card = { id: string; title: string; isFull: boolean; rsvpStatus: string | null };

test("Discover leads with a recommendation and its AI explanation", async ({ page }) => {
  await login(page, CONSUMER.email);
  await page.goto("/discover");

  const lead = page.getByRole("link", { name: /^For you: / });
  await expect(lead).toBeVisible();
  await expect(lead.getByText("AI suggestion")).toBeVisible();

  const feed = (await (await page.request.get("/api/events?limit=50")).json()) as { data: Card[] };
  const potteryPublished = feed.data.some((e) => e.title === POTTERY);
  test.info().annotations.push({ type: "scene5", description: potteryPublished ? "pottery night published" : "pottery night absent (run after Scenes 1 and 4)" });
  if (potteryPublished) await expect(page.getByRole("link", { name: `For you: ${POTTERY}` })).toBeVisible();
});

test("RSVP with sharing on, then Activity lists the event", async ({ page }) => {
  await login(page, CONSUMER.email);
  const feed = (await (await page.request.get("/api/events?limit=50")).json()) as { data: Card[] };
  const open = feed.data.find((e) => !e.isFull && e.rsvpStatus === null);
  test.skip(!open, "no open event the consumer has not RSVP'd to");

  await page.goto(`/events/${open!.id}`);
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Before you RSVP" });
  const shareWithAttendees = sheet.getByRole("switch", { name: "Share my name with other attendees" });
  if ((await shareWithAttendees.getAttribute("aria-checked")) !== "true") await shareWithAttendees.click();
  await sheet.getByRole("button", { name: "Confirm RSVP" }).click();
  await expect(page.getByRole("button", { name: "Cancel RSVP" })).toBeVisible();

  await page.goto("/activity");
  await expect(page.getByRole("region", { name: "Upcoming" }).getByText(open!.title)).toBeVisible();
});
