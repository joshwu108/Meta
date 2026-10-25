import 'server-only';
import { ApiError } from '@/lib/api/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import type { EventSummary } from '@/shared/types';
import { getEventPublic, getUpcomingEventsForUser } from './stubs';
import type { GroupEvent } from './types';

const MAX_GROUP_EVENTS = 10;
const LIVE = new Set(['published', 'full']);

async function eventIdsSharedWithGroup(groupId: string): Promise<Set<string>> {
  const { data, error } = await createAdminClient().from('invitations').select('event_id').eq('kind', 'event').eq('group_id', groupId);
  if (error) throw new ApiError('INTERNAL', 'Could not load group events', 500);
  return new Set((data ?? []).map((row) => row.event_id).filter((id): id is string => id !== null));
}

/**
 * Upcoming events for a group page (spec §6, AC5), through 06's contracts only: events a member
 * shared with the group (invite-group) and events active members have a confirmed RSVP for.
 * Names are never attached, only how many members are going. `rsvpStatus` is the viewer's own.
 */
export async function getGroupUpcomingEvents(groupId: string, activeMemberIds: readonly string[], viewerId: string): Promise<GroupEvent[]> {
  const [shared, lists] = await Promise.all([
    eventIdsSharedWithGroup(groupId),
    Promise.all(activeMemberIds.map((id) => getUpcomingEventsForUser(id).then((events) => ({ id, events })))),
  ]);
  const viewerStatus = new Map((lists.find((l) => l.id === viewerId)?.events ?? []).map((e) => [e.id, e.rsvpStatus]));
  const byId = new Map<string, { event: EventSummary; going: number }>();
  for (const { events } of lists) {
    for (const event of events) {
      const entry = byId.get(event.id) ?? { event: { ...event, rsvpStatus: viewerStatus.get(event.id) ?? null }, going: 0 };
      byId.set(event.id, { ...entry, going: entry.going + (event.rsvpStatus === 'confirmed' ? 1 : 0) });
    }
  }
  const missing = [...shared].filter((id) => !byId.has(id));
  const fetched = await Promise.all(missing.map((id) => getEventPublic(id)));
  for (const event of fetched) {
    if (event && LIVE.has(event.status) && new Date(event.startsAt).getTime() > Date.now()) {
      byId.set(event.id, { event: { id: event.id, title: event.title, startsAt: event.startsAt, status: event.status, business: event.business, rsvpStatus: null }, going: 0 });
    }
  }
  return [...byId.values()]
    .filter(({ event, going }) => going > 0 || shared.has(event.id))
    .map(({ event, going }) => ({ event, membersGoing: going, sharedWithGroup: shared.has(event.id) }))
    .sort((a, b) => new Date(a.event.startsAt).getTime() - new Date(b.event.startsAt).getTime() || a.event.id.localeCompare(b.event.id))
    .slice(0, MAX_GROUP_EVENTS);
}
