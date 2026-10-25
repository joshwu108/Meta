import 'server-only';
import { getBlockedIds, getPublicCards, unknownCard, type Actor, type PublicCard } from '@/features/matching';
import { ApiError } from '@/lib/api/errors';
import type { GroupMemberRow, GroupRow } from '@/shared/schemas/social';
import { loadMemberRows, toMembership } from './context';
import { parseSuggestions } from './plans';
import type { GroupKind, GroupSummary } from './types';

const PREVIEW_SIZE = 5;
const ROLE_ORDER = { owner: 0, admin: 1, member: 2 } as const;

type Lookups = {
  active: GroupMemberRow[];
  mine: Map<string, { role: string; status: string }>;
  invitations: Map<string, string>;
  planTitles: Map<string, string>;
  cards: Map<string, PublicCard>;
};

function previewIds(active: readonly GroupMemberRow[], groupId: string): string[] {
  return active
    .filter((row) => row.group_id === groupId)
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
    .slice(0, PREVIEW_SIZE)
    .map((row) => row.user_id);
}

function toSummary(group: GroupRow, lookups: Lookups): GroupSummary {
  const membership = toMembership(lookups.mine.get(group.id));
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    interests: group.interests,
    visibility: group.visibility,
    kind: group.kind as GroupKind,
    memberCount: lookups.active.filter((row) => row.group_id === group.id).length,
    memberPreview: previewIds(lookups.active, group.id).map((id) => lookups.cards.get(id) ?? unknownCard(id)),
    myRole: membership?.role ?? null,
    myStatus: membership?.status ?? null,
    invitationId: lookups.invitations.get(group.id) ?? null,
    latestPlanTitle: lookups.planTitles.get(group.id) ?? null,
  };
}

async function loadLookups(actor: Actor, ids: string[]): Promise<Lookups> {
  const [active, mine, invitations, plans] = await Promise.all([
    loadMemberRows(actor, ids, ['active']),
    actor.supabase.from('group_members').select('group_id, role, status').eq('user_id', actor.userId).in('group_id', ids),
    actor.supabase.from('invitations').select('id, group_id').eq('recipient_id', actor.userId).eq('kind', 'group').eq('status', 'pending').in('group_id', ids),
    actor.supabase.from('group_plans').select('group_id, suggestions, created_at').in('group_id', ids).order('created_at', { ascending: false }),
  ]);
  if (mine.error || invitations.error || plans.error) throw new ApiError('INTERNAL', 'Could not load groups', 500);
  const planTitles = new Map<string, string>();
  for (const plan of plans.data ?? []) {
    const first = parseSuggestions(plan.suggestions)[0];
    if (first && !planTitles.has(plan.group_id)) planTitles.set(plan.group_id, first.title);
  }
  const cards = await getPublicCards(ids.flatMap((id) => previewIds(active, id)));
  return {
    active,
    mine: new Map((mine.data ?? []).map((row) => [row.group_id, row])),
    invitations: new Map((invitations.data ?? []).flatMap((row) => (row.group_id ? [[row.group_id, row.id] as const] : []))),
    planTitles,
    cards,
  };
}

/** Summaries for groups the actor can already see (RLS-scoped reads throughout). */
export async function buildSummaries(actor: Actor, groups: readonly GroupRow[]): Promise<GroupSummary[]> {
  if (groups.length === 0) return [];
  const lookups = await loadLookups(actor, groups.map((g) => g.id));
  return groups.map((group) => toSummary(group, lookups));
}

/** GET /api/groups: groups the actor belongs to (active) or is invited to, by name. */
export async function listMyGroups(actor: Actor): Promise<GroupSummary[]> {
  const { data: rows, error } = await actor.supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', actor.userId)
    .in('status', ['active', 'invited']);
  if (error) throw new ApiError('INTERNAL', 'Could not load your groups', 500);
  const ids = (rows ?? []).map((row) => row.group_id);
  if (ids.length === 0) return [];
  const { data: groups, error: groupError } = await actor.supabase.from('groups').select('*').in('id', ids).order('name');
  if (groupError) throw new ApiError('INTERNAL', 'Could not load your groups', 500);
  return buildSummaries(actor, (groups ?? []) as GroupRow[]);
}

/** GET /api/groups?discover=1 (P1): public groups, largest first, none created by a blocked user. */
export async function listPublicGroups(actor: Actor, limit = 30): Promise<GroupSummary[]> {
  const [{ data, error }, blocked] = await Promise.all([
    actor.supabase.from('groups').select('*').eq('visibility', 'public').order('created_at', { ascending: false }).limit(100),
    getBlockedIds(actor.userId),
  ]);
  if (error) throw new ApiError('INTERNAL', 'Could not load groups', 500);
  const visible = ((data ?? []) as GroupRow[]).filter((group) => !blocked.has(group.creator_id));
  const summaries = await buildSummaries(actor, visible);
  return summaries.sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name)).slice(0, limit);
}
