import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventSummary } from "@/shared/types";
import { savedUpcomingEvents } from "./bookmarks";
import { loadCardContext, toEventCard, type EventCard } from "./cards";
import { inChunks } from "./chunks";
import { listFollowUps, type FollowUpView } from "./follow-ups";
import { toEventSummary } from "./mappers";
import { eventsForUser, getEventsByIds, profilePreviews, type ProfilePreview } from "./repo";
import {
  createAdminClient,
  getPendingConnectionRequests,
  getPendingEventInvitations,
  listNotifications,
  type NotificationItem,
} from "./stubs";
import { millis } from "./time";

export type PastEventCard = EventCard & { feedbackGiven: boolean };

export type Activity = {
  upcoming: EventCard[];
  saved: EventCard[];
  past: PastEventCard[];
  invitations: Array<{ id: string; groupId: string | null; sender: ProfilePreview | null; event: EventSummary }>;
  connectionRequests: Array<{ id: string; requester: ProfilePreview | null; message: string | null; createdAt: string }>;
  followUps: FollowUpView[];
  notifications: NotificationItem[];
};

async function feedbackGiven(admin: SupabaseClient, userId: string, eventIds: readonly string[]): Promise<Set<string>> {
  const rows = await inChunks(eventIds, async (part) => {
    const { data } = await admin.from("event_feedback").select("event_id").eq("user_id", userId).in("event_id", part);
    return data ?? [];
  });
  return new Set(rows.map((r) => r.event_id as string));
}

async function myEvents(admin: SupabaseClient, userId: string): Promise<Pick<Activity, "upcoming" | "past">> {
  const mine = await eventsForUser(admin, userId);
  const now = Date.now();
  const isPast = (row: (typeof mine)[number]["row"]) => row.status === "completed" || millis(row.ends_at) < now;
  const rows = mine.map((m) => m.row);
  const ctx = await loadCardContext(admin, userId, rows);
  const pastRows = rows.filter(isPast).reverse();
  const given = await feedbackGiven(admin, userId, pastRows.map((r) => r.id));
  return {
    upcoming: rows.filter((r) => !isPast(r) && r.status !== "cancelled").map((r) => toEventCard(r, ctx)),
    past: pastRows.map((r) => ({ ...toEventCard(r, ctx), feedbackGiven: given.has(r.id) })),
  };
}

/** GET /activity: the My Activity hub (Screen 8). */
export async function getActivity(userId: string): Promise<Activity> {
  const admin = createAdminClient();
  const [events, saved, invites, requests, followUps, notifications] = await Promise.all([
    myEvents(admin, userId),
    savedUpcomingEvents(userId),
    getPendingEventInvitations(userId),
    getPendingConnectionRequests(userId),
    listFollowUps(userId),
    listNotifications(userId),
  ]);
  const [inviteEvents, people] = await Promise.all([
    getEventsByIds(admin, invites.map((i) => i.eventId)),
    profilePreviews(admin, [...invites.map((i) => i.senderId), ...requests.map((r) => r.requesterId)]),
  ]);
  const eventsById = new Map(inviteEvents.map((e) => [e.id, e]));
  const going = new Set(events.upcoming.map((e) => e.id));
  return {
    ...events,
    saved: saved.filter((e) => !going.has(e.id)),
    invitations: invites.flatMap((i) => {
      const row = eventsById.get(i.eventId);
      if (!row || (row.status !== "published" && row.status !== "full")) return [];
      return [{ id: i.id, groupId: i.groupId, sender: people.get(i.senderId) ?? null, event: toEventSummary(row, null) }];
    }),
    connectionRequests: requests.map((r) => ({
      id: r.id, requester: people.get(r.requesterId) ?? null, message: r.message, createdAt: r.createdAt,
    })),
    followUps,
    notifications,
  };
}
