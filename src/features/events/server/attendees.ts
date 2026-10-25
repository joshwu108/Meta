import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inChunks } from "./chunks";
import { confirmedAttendees, myRsvps } from "./repo";
import { ApiError, createAdminClient, getAttendeeSharing, getBlockEdges, getConnectionIds, type AttendeeSharing } from "./stubs";
import { buildAttendeeList, type AttendeeList, type AttendeeRow, type ViewerContext } from "./visibility";

export type AttendeeData = { viewer: ViewerContext; rows: AttendeeRow[] };

/** 02's reader puts every id in one `.in()`; an event holds up to 500 people, so ask 100 at a time. */
async function attendeeSharing(userIds: readonly string[]): Promise<Map<string, AttendeeSharing>> {
  return new Map(await inChunks(userIds, async (part) => [...(await getAttendeeSharing(part))]));
}

/**
 * Everything the visibility function needs for one viewer and one event's confirmed attendees.
 * Interests are loaded (and released by 02) only when `withInterests` is set, i.e. for a viewer
 * who is a confirmed attendee; previews never carry them.
 */
export async function loadAttendeeData(
  admin: SupabaseClient, viewerId: string, eventId: string, { withInterests }: { withInterests: boolean },
): Promise<AttendeeData> {
  const attendees = await confirmedAttendees(admin, eventId);
  const [sharing, connectionIds, blocks] = await Promise.all([
    withInterests ? attendeeSharing([viewerId, ...attendees.map((a) => a.userId)]) : Promise.resolve(new Map<string, AttendeeSharing>()),
    getConnectionIds(viewerId),
    getBlockEdges(viewerId),
  ]);
  const mine = sharing.get(viewerId);
  const viewer: ViewerContext = {
    userId: viewerId,
    interests: mine?.interests ?? [],
    shareInterestsWithAttendees: mine?.shareInterestsWithAttendees ?? false,
    connectionIds,
    blocks,
  };
  const rows: AttendeeRow[] = attendees.map((a) => ({
    userId: a.userId,
    displayName: a.displayName ?? "",
    avatarUrl: a.avatarUrl,
    interests: sharing.get(a.userId)?.interests ?? [],
    shareWithAttendees: a.shareWithAttendees && a.displayName !== null,
    shareInterestsWithAttendees: sharing.get(a.userId)?.shareInterestsWithAttendees ?? false,
  }));
  return { viewer, rows };
}

/** GET /events/:id/attendees: only for viewers holding a confirmed RSVP. */
export async function getAttendeeList(viewerId: string, eventId: string): Promise<AttendeeList> {
  const admin = createAdminClient();
  const mine = await myRsvps(admin, viewerId, [eventId]);
  if (mine.get(eventId)?.status !== "confirmed") {
    throw new ApiError("FORBIDDEN", "RSVP to see who else is going");
  }
  const { viewer, rows } = await loadAttendeeData(admin, viewerId, eventId, { withInterests: true });
  return buildAttendeeList(viewer, rows);
}
