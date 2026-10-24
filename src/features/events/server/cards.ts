import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventCategory } from "@/shared/enums";
import type { EventSummary } from "@/shared/types";
import type { EventRow } from "../schemas";
import { toEventSummary } from "./mappers";
import { confirmedCounts, friendsGoing, myRsvps, profilePreviews, type MyRsvp, type ProfilePreview } from "./repo";
import { getBlockEdges, getConnectionIds } from "./stubs";
import { isBlockedEitherWay } from "./visibility";

export type EventCard = EventSummary & {
  endsAt: string;
  category: EventCategory;
  capacity: number;
  priceCents: number | null;
  confirmedCount: number;
  isFull: boolean;
  needsReconfirm: boolean;
  friendsGoing: ProfilePreview[];
};

export type CardContext = {
  counts: Map<string, number>;
  mine: Map<string, MyRsvp>;
  friendsByEvent: Map<string, ProfilePreview[]>;
};

/** Connections the viewer can see at events: accepted, and not blocked either way. */
export async function visibleFriendIds(viewerId: string): Promise<Set<string>> {
  const [connections, blocks] = await Promise.all([getConnectionIds(viewerId), getBlockEdges(viewerId)]);
  return new Set([...connections].filter((id) => !isBlockedEitherWay(blocks, viewerId, id)));
}

/** Loads counts, the viewer's RSVPs and consented friends for a batch of events. */
export async function loadCardContext(admin: SupabaseClient, viewerId: string, rows: readonly EventRow[]): Promise<CardContext> {
  const ids = rows.map((r) => r.id);
  const [counts, mine, friendIds] = await Promise.all([
    confirmedCounts(admin, ids),
    myRsvps(admin, viewerId, ids),
    visibleFriendIds(viewerId),
  ]);
  const going = await friendsGoing(admin, ids, friendIds);
  const previews = await profilePreviews(admin, [...new Set([...going.values()].flat())]);
  const friendsByEvent = new Map(
    [...going].map(([eventId, userIds]) => [
      eventId,
      userIds.map((id) => previews.get(id)).filter((p): p is ProfilePreview => p !== undefined),
    ]),
  );
  return { counts, mine, friendsByEvent };
}

export function toEventCard(row: EventRow, ctx: CardContext): EventCard {
  const rsvp = ctx.mine.get(row.id);
  const confirmedCount = ctx.counts.get(row.id) ?? 0;
  return {
    ...toEventSummary(row, rsvp?.status ?? null),
    endsAt: row.ends_at,
    category: row.category,
    capacity: row.capacity,
    priceCents: row.price_cents,
    confirmedCount,
    isFull: row.status === "full" || confirmedCount >= row.capacity,
    needsReconfirm: rsvp?.status === "confirmed" && rsvp.needsReconfirm,
    friendsGoing: ctx.friendsByEvent.get(row.id) ?? [],
  };
}

export async function buildEventCards(admin: SupabaseClient, viewerId: string, rows: readonly EventRow[]): Promise<EventCard[]> {
  const ctx = await loadCardContext(admin, viewerId, rows);
  return rows.map((row) => toEventCard(row, ctx));
}
