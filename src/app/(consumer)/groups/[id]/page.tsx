import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/core';
import { GroupScreen } from '@/features/groups/components/GroupScreen';
import type { InviteCandidate } from '@/features/groups/components/InvitePicker';
import { getGroupDetail } from '@/features/groups/server/detail';
import type { GroupDetail } from '@/features/groups';
import { getMatchesForViewer, listConnections, type Actor } from '@/features/matching';
import { ApiError } from '@/lib/api/errors';
import { createServerClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/shared/schemas/common';

export const metadata = { title: 'Group' };

type Props = { params: Promise<{ id: string }> };

/** People the viewer can invite: connections and open requests first, then matches. */
async function inviteCandidates(actor: Actor, group: GroupDetail): Promise<InviteCandidate[]> {
  if (!group.permissions.canInvite) return [];
  const [connections, matches] = await Promise.all([listConnections(actor), getMatchesForViewer(actor.userId, { limit: 20 })]);
  const taken = new Set([...group.members, ...group.invited].map((member) => member.user.id));
  const byId = new Map<string, InviteCandidate>();
  for (const c of connections) {
    if (c.status === 'declined' || taken.has(c.user.id)) continue;
    byId.set(c.user.id, { user: c.user, source: c.status === 'accepted' ? 'connection' : 'requested' });
  }
  for (const m of matches.matches) if (!taken.has(m.user.id) && !byId.has(m.user.id)) byId.set(m.user.id, { user: m.user, source: 'match' });
  return [...byId.values()];
}

async function loadGroup(actor: Actor, id: string): Promise<GroupDetail> {
  try {
    return await getGroupDetail(actor, id);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
}

/** Screen 5: group header, Plans (AI planner), Events (from 06) and Members. */
export default async function GroupPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const actor = { userId: user.id, supabase: await createServerClient() };
  const group = await loadGroup(actor, id);
  const candidates = await inviteCandidates(actor, group);
  return <GroupScreen group={group} candidates={candidates} />;
}
