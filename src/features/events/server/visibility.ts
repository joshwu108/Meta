import "server-only";

export type BlockEdge = { blockerId: string; blockedId: string };

/** One confirmed RSVP joined with the attendee's public card and consent flags. */
export type AttendeeRow = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  interests: readonly string[];
  /** Consent snapshot stored on the RSVP row. */
  shareWithAttendees: boolean;
  /** 02's `agent_profiles.consent.share_interests_with_attendees`. */
  shareInterestsWithAttendees: boolean;
};

export type ViewerContext = {
  userId: string;
  interests: readonly string[];
  shareInterestsWithAttendees: boolean;
  /** Accepted connections (03). */
  connectionIds: ReadonlySet<string>;
  /** Every block edge that involves the viewer, in either direction. */
  blocks: readonly BlockEdge[];
};

export type AttendeeView = {
  userId?: string;
  displayName?: string;
  avatarUrl?: string | null;
  sharedInterests?: string[];
  isConnection: boolean;
};

export type AttendeeList = { count: number; attendees: AttendeeView[] };

export function isBlockedEitherWay(blocks: readonly BlockEdge[], a: string, b: string): boolean {
  return blocks.some((e) => (e.blockerId === a && e.blockedId === b) || (e.blockerId === b && e.blockedId === a));
}

/**
 * The single place that decides what one attendee reveals to one viewer (spec §12).
 * Returns null when the pair is blocked either way; an anonymous entry without consent.
 */
export function viewAttendee(viewer: ViewerContext, row: AttendeeRow): AttendeeView | null {
  if (isBlockedEitherWay(viewer.blocks, viewer.userId, row.userId)) return null;
  if (!row.shareWithAttendees) return { isConnection: false };

  const base: AttendeeView = {
    userId: row.userId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    isConnection: viewer.connectionIds.has(row.userId),
  };
  if (!viewer.shareInterestsWithAttendees || !row.shareInterestsWithAttendees) return base;

  const theirs = new Set(row.interests);
  return { ...base, sharedInterests: viewer.interests.filter((tag) => theirs.has(tag)) };
}

const rank = (a: AttendeeView) => (a.isConnection ? 0 : a.userId ? 1 : 2);

/** Attendee list for a viewer who holds a confirmed RSVP; `count` is every confirmed attendee, viewer included. */
export function buildAttendeeList(viewer: ViewerContext, rows: readonly AttendeeRow[]): AttendeeList {
  const others = rows.filter((r) => r.userId !== viewer.userId);
  const attendees = others
    .map((r) => viewAttendee(viewer, r))
    .filter((a): a is AttendeeView => a !== null)
    .map((a, index) => ({ a, index }))
    .sort((x, y) => rank(x.a) - rank(y.a) || x.index - y.index)
    .map(({ a }) => a);
  return { count: rows.length, attendees };
}
