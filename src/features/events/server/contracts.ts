import "server-only";
import type { EventPublic, EventSummary } from "@/shared/types";
import { toEventPublic, toEventSummary } from "./mappers";
import { confirmedCounts, eventsForUser, getVisibleEvent, listLiveEventsBetween, myRsvps } from "./repo";
import { createAdminClient } from "./stubs";
import { compareInstants, millis } from "./time";

const UPCOMING_DAYS = 21;

/**
 * Upcoming events relevant to a user: every live event in the next 21 days plus any
 * upcoming event they hold a confirmed/waitlisted RSVP for, soonest first, each with
 * the user's RSVP status (null when they have not RSVP'd). Used by 03's group planner.
 */
export async function getUpcomingEventsForUser(userId: string): Promise<EventSummary[]> {
  const admin = createAdminClient();
  const now = new Date();
  const [live, mine] = await Promise.all([
    listLiveEventsBetween(admin, now, new Date(now.getTime() + UPCOMING_DAYS * 86_400_000)),
    eventsForUser(admin, userId),
  ]);
  const upcomingMine = mine.filter(({ row }) => millis(row.starts_at) >= now.getTime() && row.status !== "cancelled");
  const statuses = await myRsvps(admin, userId, live.map((r) => r.id));
  const byId = new Map([
    ...live.map((row) => [row.id, toEventSummary(row, statuses.get(row.id)?.status ?? null)] as const),
    ...upcomingMine.map(({ row, rsvp }) => [row.id, toEventSummary(row, rsvp.status)] as const),
  ]);
  return [...byId.values()].sort((a, b) => compareInstants(a.startsAt, b.startsAt) || a.id.localeCompare(b.id));
}

/** Public view of one event (published, full, completed or cancelled); null for drafts or unknown ids. */
export async function getEventPublic(eventId: string): Promise<EventPublic | null> {
  const admin = createAdminClient();
  const row = await getVisibleEvent(admin, eventId);
  if (!row) return null;
  const counts = await confirmedCounts(admin, [row.id]);
  return toEventPublic(row, counts.get(row.id) ?? 0, null);
}
