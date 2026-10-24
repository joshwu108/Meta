import 'server-only';
import { getPublicCards, unknownCard, type Actor, type PublicCard } from '@/features/matching';
import type { MemberRole, MembershipStatus } from '@/shared/enums';
import type { GroupMemberRow } from '@/shared/schemas/social';
import { canEdit, canInvite, canPlan, canTransfer, canVote } from './authz';
import { loadGroupContext, loadMemberRows } from './context';
import { getGroupUpcomingEvents } from './events';
import { loadLatestPlan } from './plans';
import { buildSummaries } from './summaries';
import type { GroupDetail, RosterMember } from './types';

const ROLE_ORDER: Record<MemberRole, number> = { owner: 0, admin: 1, member: 2 };

function toRoster(rows: readonly GroupMemberRow[], cards: Map<string, PublicCard>, viewerId: string): RosterMember[] {
  return rows
    .map((row) => ({
      user: cards.get(row.user_id) ?? unknownCard(row.user_id),
      role: row.role as MemberRole,
      status: row.status as MembershipStatus,
      joinedAt: row.joined_at,
      isMe: row.user_id === viewerId,
    }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || (a.joinedAt ?? '').localeCompare(b.joinedAt ?? ''));
}

/**
 * GET /api/groups/:id: the group, its roster (public cards; pending invitees for admins only),
 * the viewer's role and permissions, upcoming events (06) and, for active members, the latest plan.
 */
export async function getGroupDetail(actor: Actor, groupId: string): Promise<GroupDetail> {
  const { group, membership, facts } = await loadGroupContext(actor, groupId);
  const rows = await loadMemberRows(actor, [groupId], ['active', 'invited']);
  const active = rows.filter((row) => row.status === 'active');
  const isAdmin = canEdit(membership);
  const visibleRows = isAdmin ? rows : active;
  const [cards, [summary], upcomingEvents, latestPlan] = await Promise.all([
    getPublicCards(visibleRows.map((row) => row.user_id)),
    buildSummaries(actor, [group]),
    getGroupUpcomingEvents(groupId, active.map((row) => row.user_id), actor.userId),
    membership?.status === 'active' ? loadLatestPlan(actor, groupId, active.length) : Promise.resolve(null),
  ]);
  return {
    ...summary!,
    creatorId: group.creator_id,
    createdAt: group.created_at,
    members: toRoster(active, cards, actor.userId),
    invited: isAdmin ? toRoster(rows.filter((row) => row.status === 'invited'), cards, actor.userId) : [],
    permissions: {
      canEdit: isAdmin,
      canInvite: canInvite(facts, membership),
      canPlan: canPlan(facts, membership, actor.userId),
      canVote: canVote(membership),
      canTransfer: canTransfer(membership),
      canLeave: membership?.status === 'active',
    },
    upcomingEvents,
    latestPlan,
  };
}
