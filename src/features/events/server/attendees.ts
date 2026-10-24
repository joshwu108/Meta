import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmedAttendees, myRsvps } from "./repo";
import { ApiError, createAdminClient, getAttendeeSharing, getBlockEdges, getConnectionIds } from "./stubs";
import { buildAttendeeList, type AttendeeList, type AttendeeRow, type ViewerContext } from "./visibility";

export type AttendeeData = { viewer: ViewerContext; rows: AttendeeRow[] };

/** Everything the visibility function needs for one viewer and one event's confirmed attendees. */
export async function loadAttendeeData(admin: SupabaseClient, viewerId: string, eventId: string): Promise<AttendeeData> {
  const attendees = await confirmedAttendees(admin, eventId);
  const [sharing, connectionIds, blocks] = await Promise.all([
    getAttendeeSharing([viewerId, ...attendees.map((a) => a.userId)]),
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
  const { viewer, rows } = await loadAttendeeData(admin, viewerId, eventId);
  return buildAttendeeList(viewer, rows);
}
