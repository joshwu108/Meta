import "server-only";
import type { BusinessPublicCard, EventPublic } from "@/shared/types";
import { loadAttendeeData } from "./attendees";
import { bookmarkedEventIds } from "./bookmarks";
import { toBusinessCard, toEventPublic } from "./mappers";
import { canComplete } from "./post-event";
import { confirmedCounts, getVisibleEvent, hasFeedback, myRsvps, type MyRsvp } from "./repo";
import { waitlistEnabled } from "./rsvp";
import { ApiError, createAdminClient, getRsvpConsentDefaults } from "./stubs";
import { buildAttendeeList, type AttendeeView } from "./visibility";

const PREVIEW_SIZE = 5;

export type EventDetail = EventPublic & {
  myRsvp: Omit<MyRsvp, "eventId"> | null;
  needsReconfirm: boolean;
  venue: BusinessPublicCard & { lat: number; lng: number };
  attendeePreview: { count: number; avatars: AttendeeView[] };
  consentDefaults: { shareWithAttendees: boolean; shareWithBusiness: boolean };
  feedbackGiven: boolean;
  waitlistEnabled: boolean;
  bookmarked: boolean;
  /** Venue owner, or the demo operator while DEMO_MODE=1 (Scene 6). */
  canComplete: boolean;
};

/**
 * GET /events/:id. Preview avatars are consented attendees the viewer may already see:
 * everyone named if the viewer is confirmed, otherwise only their own connections.
 */
export async function getEventDetail(viewerId: string, eventId: string): Promise<EventDetail> {
  const admin = createAdminClient();
  const row = await getVisibleEvent(admin, eventId);
  if (!row) throw new ApiError("NOT_FOUND", "Event not found");

  const live = row.status === "published" || row.status === "full";
  const [counts, mine, attendeeData, consentDefaults, feedbackGiven, bookmarks, completable] = await Promise.all([
    confirmedCounts(admin, [eventId]),
    myRsvps(admin, viewerId, [eventId]),
    loadAttendeeData(admin, viewerId, eventId),
    getRsvpConsentDefaults(viewerId),
    row.status === "completed" ? hasFeedback(admin, viewerId, eventId) : Promise.resolve(false),
    bookmarkedEventIds(admin, viewerId),
    live ? canComplete(admin, viewerId, row.business_id) : Promise.resolve(false),
  ]);
  const rsvp = mine.get(eventId) ?? null;
  const confirmed = rsvp?.status === "confirmed";
  const list = buildAttendeeList(attendeeData.viewer, attendeeData.rows);
  const avatars = list.attendees.filter((a) => a.userId && (confirmed || a.isConnection)).slice(0, PREVIEW_SIZE);

  return {
    ...toEventPublic(row, counts.get(eventId) ?? 0, rsvp?.status ?? null),
    myRsvp: rsvp && {
      status: rsvp.status,
      needsReconfirm: rsvp.needsReconfirm,
      shareWithAttendees: rsvp.shareWithAttendees,
      shareWithBusiness: rsvp.shareWithBusiness,
    },
    needsReconfirm: confirmed && rsvp.needsReconfirm,
    venue: { ...toBusinessCard(row.businesses), lat: row.businesses.lat, lng: row.businesses.lng },
    attendeePreview: { count: list.count, avatars },
    consentDefaults,
    feedbackGiven,
    waitlistEnabled: waitlistEnabled(),
    bookmarked: bookmarks.has(eventId),
    canComplete: completable,
  };
}
