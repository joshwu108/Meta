import 'server-only';
import { ApiError } from '@/lib/api/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { chunk, ID_FILTER_BATCH } from '@/features/matching';
import type { ProvenanceRow } from './strength';
import type { GraphConnection, GraphEventItem, GraphGroup, GraphPerson } from './types';

/**
 * Reads for the graph snapshot. Service-role, like 03's `social-graph.ts`, because RLS hides other
 * people's blocks and rosters — every query here is keyed on the viewer and returns only rows that
 * involve them.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back an event still counts as "we were in the same room". */
export const EVENT_LOOKBACK_DAYS = 60;
export const EVENT_LIMIT = 12;
/** Provenance older than this no longer moves a tie's strength (45-day half-life). */
export const PROVENANCE_LOOKBACK_DAYS = 240;

function failed(what: string, message: string): never {
  throw new ApiError('INTERNAL', `Could not load ${what}`, 500, { cause: message });
}

/** The viewer's own profile card. Read directly: they may not be discoverable to anyone else. */
export async function loadViewer(userId: string): Promise<GraphPerson | null> {
  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('id, display_name, avatar_url, bio, neighborhood')
    .eq('id', userId)
    .maybeSingle();
  if (error) failed('your profile', error.message);
  if (!data) return null;
  return {
    id: data.id,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    bio: data.bio,
    neighborhood: data.neighborhood,
  };
}

/** Every connection row involving the viewer, in either direction. */
export async function loadConnections(userId: string): Promise<GraphConnection[]> {
  const { data, error } = await createAdminClient()
    .from('connections')
    .select('id, requester_id, recipient_id, status')
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);
  if (error) failed('your connections', error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    otherId: row.requester_id === userId ? row.recipient_id : row.requester_id,
    status: row.status as GraphConnection['status'],
    direction: row.recipient_id === userId ? 'incoming' : 'outgoing',
  }));
}

/** Groups the viewer is an active member of, with their other active members. */
export async function loadGroups(userId: string): Promise<GraphGroup[]> {
  const admin = createAdminClient();
  const mine = await admin
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (mine.error) failed('your groups', mine.error.message);
  const groupIds = (mine.data ?? []).map((row) => row.group_id);
  if (groupIds.length === 0) return [];

  const [groups, members] = await Promise.all([
    admin.from('groups').select('id, name, archived_at').in('id', groupIds),
    admin
      .from('group_members')
      .select('group_id, user_id')
      .in('group_id', groupIds)
      .eq('status', 'active'),
  ]);
  if (groups.error) failed('your groups', groups.error.message);
  if (members.error) failed('group members', members.error.message);

  const byGroup = new Map<string, string[]>();
  for (const row of members.data ?? []) {
    const list = byGroup.get(row.group_id);
    if (list) list.push(row.user_id);
    else byGroup.set(row.group_id, [row.user_id]);
  }
  return (groups.data ?? [])
    .filter((group) => group.archived_at === null)
    .map((group) => {
      const all = byGroup.get(group.id) ?? [];
      return {
        id: group.id,
        name: group.name,
        memberIds: all.filter((id) => id !== userId),
        memberCount: all.length,
      };
    })
    .sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name));
}

/**
 * Events the viewer is confirmed for, recent or upcoming, with the other confirmed attendees who
 * agreed at RSVP time to be visible to the people they are sitting with.
 */
export async function loadEvents(userId: string, now: number): Promise<GraphEventItem[]> {
  const admin = createAdminClient();
  const mine = await admin
    .from('rsvps')
    .select('event_id')
    .eq('user_id', userId)
    .eq('status', 'confirmed');
  if (mine.error) failed('your RSVPs', mine.error.message);
  const eventIds = (mine.data ?? []).map((row) => row.event_id);
  if (eventIds.length === 0) return [];

  const since = new Date(now - EVENT_LOOKBACK_DAYS * DAY_MS).toISOString();
  const events = await admin
    .from('events')
    .select('id, title, starts_at')
    .in('id', eventIds)
    .gte('starts_at', since)
    .neq('status', 'cancelled')
    .order('starts_at', { ascending: false })
    .limit(EVENT_LIMIT);
  if (events.error) failed('your events', events.error.message);
  const kept = events.data ?? [];
  if (kept.length === 0) return [];

  const attendees = await admin
    .from('rsvps')
    .select('event_id, user_id, share_with_attendees')
    .in(
      'event_id',
      kept.map((event) => event.id),
    )
    .eq('status', 'confirmed');
  if (attendees.error) failed('attendees', attendees.error.message);

  const byEvent = new Map<string, string[]>();
  for (const row of attendees.data ?? []) {
    if (row.user_id === userId || !row.share_with_attendees) continue;
    const list = byEvent.get(row.event_id);
    if (list) list.push(row.user_id);
    else byEvent.set(row.event_id, [row.user_id]);
  }
  return kept.map((event) => ({
    id: event.id,
    title: event.title,
    startsAt: event.starts_at,
    attendeeIds: byEvent.get(event.id) ?? [],
  }));
}

/** Provenance rows for the viewer's pairs, recent enough to still carry weight. */
export async function loadProvenance(userId: string, now: number): Promise<ProvenanceRow[]> {
  const since = new Date(now - PROVENANCE_LOOKBACK_DAYS * DAY_MS).toISOString();
  const { data, error } = await createAdminClient()
    .from('graph_edge_events')
    .select('actor_id, subject_id, kind, weight, created_at')
    .or(`actor_id.eq.${userId},subject_id.eq.${userId}`)
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  if (error) failed('your graph history', error.message);
  return (data ?? []) as ProvenanceRow[];
}

/** Public cards for everyone who might appear, in PostgREST-sized batches. */
export async function loadPeople(userIds: readonly string[]): Promise<Map<string, GraphPerson>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const admin = createAdminClient();
  const reads = await Promise.all(
    chunk(ids, ID_FILTER_BATCH).map((batch) =>
      admin
        .from('profiles')
        .select('id, display_name, avatar_url, bio, neighborhood')
        .in('id', batch),
    ),
  );
  if (reads.some((read) => read.error)) failed('profiles', 'profile read failed');
  return new Map(
    reads
      .flatMap((read) => read.data ?? [])
      .map((row) => [
        row.id,
        {
          id: row.id,
          displayName: row.display_name,
          avatarUrl: row.avatar_url,
          bio: row.bio,
          neighborhood: row.neighborhood,
        },
      ]),
  );
}
