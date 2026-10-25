import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

// Clicks every WS06 action a judge can reach on seeded data, failing on uncaught page errors or
// browser console errors. Runs as leo@ (active member of "Mission Makers"), whom no other 06 spec uses.
const USER = "leo@commonground.test";
type Card = { id: string; title: string; category: string; isFull: boolean; rsvpStatus: string | null };

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/favicon|Download the React DevTools/.test(msg.text())) errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

async function openEvents(page: Page): Promise<Card[]> {
  const res = await page.request.get("/api/events?limit=50");
  return ((await res.json()) as { data: Card[] }).data;
}

test("save, invite a group, filter, places and not-found work without errors", async ({ page }) => {
  const errors = watchErrors(page);
  await login(page, USER);
  const event = (await openEvents(page)).find((e) => !e.isFull && e.rsvpStatus === null);
  test.skip(!event, "no open event");

  // A real pointer must reach the bell popover (its deep links lead into events); the header once clipped it.
  await page.getByTestId("notification-bell").click();
  const bellDialog = page.getByRole("dialog", { name: "Notifications" });
  await expect(bellDialog).toBeVisible();
  const reachable = await bellDialog.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return hit !== null && el.contains(hit);
  });
  expect(reachable, "bell popover receives clicks").toBe(true);

  await page.goto(`/events/${event!.id}`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible({ timeout: 20_000 });

  await page.getByLabel("Invite a group").selectOption({ label: "Mission Makers" });
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /Invited \d+ member|already invited or going|no one else in that group/ })).toBeVisible({ timeout: 20_000 });

  await page.goto("/activity");
  await expect(page.getByRole("region", { name: "Saved" }).getByText(event!.title)).toBeVisible({ timeout: 20_000 });

  await page.goto("/events?tab=all");
  await page.getByLabel("Category").first().selectOption({ label: "Food & drink" });
  await page.getByRole("button", { name: "Apply filters" }).first().click();
  await expect(page).toHaveURL(/category=food_drink/);
  const titles = await page.getByRole("list").getByRole("heading", { level: 3 }).allTextContents();
  const foodTitles = (await openEvents(page)).filter((e) => e.category === "food_drink").map((e) => e.title);
  expect(titles.every((t) => foodTitles.includes(t))).toBe(true);

  await page.goto("/places");
  await expect(page.getByRole("heading", { name: "Places near you" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Kiln & Cup").first()).toBeVisible();

  await page.goto("/events/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("This event isn't available.")).toBeVisible({ timeout: 20_000 });

  expect(errors).toEqual([]);
});

test("RSVP, mark completed (DEMO_MODE) and leave feedback", async ({ page }) => {
  const errors = watchErrors(page);
  await login(page, USER);
  const event = (await openEvents(page)).find((e) => !e.isFull && e.rsvpStatus === null);
  test.skip(!event, "no open event");

  await page.goto(`/events/${event!.id}`);
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await page.getByRole("dialog", { name: "Before you RSVP" }).getByRole("button", { name: "Confirm RSVP" }).click();
  await expect(page.getByRole("button", { name: "Cancel RSVP" })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Mark event completed" }).click();
  await page.getByRole("button", { name: "Yes, mark completed" }).click();
  await expect(page.getByRole("heading", { name: "How did it go?" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("radio", { name: "4 stars" }).click();
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Thanks for your feedback.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Who would you like to see again?" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("agent chat event cards open real events", async ({ page }) => {
  const errors = watchErrors(page);
  await login(page, USER);
  await page.goto("/agent");
  await page.getByPlaceholder("Message your agent").fill("Anything fun this week?");
  await page.getByRole("button", { name: "Send" }).click();

  const events = page.locator('main a[href^="/events/"]');
  await expect(events.first()).toBeVisible({ timeout: 20_000 });
  for (const href of await events.evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""))) {
    expect(href).toMatch(/^\/events\/[0-9a-f-]{36}$/);
    expect(href).not.toContain("00000000-0000-4000-8000");
  }
  await events.first().click();
  await page.waitForURL(/\/events\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("This event isn't available.")).toHaveCount(0);

  expect(errors).toEqual([]);
});
