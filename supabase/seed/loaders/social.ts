import type { z } from 'zod';
import { isMissingTable, loadFixture, requireUser, type SeedContext } from '../context';
import { seedBlockSchema, seedConnectionSchema, seedGroupSchema } from '../types';

/** `loadFixture` types items as the schema input, so defaulted arrays may be absent. */
type SeedGroup = z.input<typeof seedGroupSchema>;

/**
 * Social graph seed owned by workstream 03 (specs/03-matching-and-groups/specs.md §8): groups with
 * their owner, active members and pending invitations; accepted connections among seeded users
 * (none for demo.new, whose Scene 2 runs live); one block pair that proves the match filter.
 */

async function insertGroup(ctx: SeedContext, group: SeedGroup): Promise<string | null> {
  const ownerId = requireUser(ctx, group.owner);
  const { data, error } = await ctx.admin
    .from('groups')
    .insert({
      name: group.name,
      description: group.description,
      visibility: group.visibility,
      kind: group.visibility === 'public' ? 'interest' : 'private',
      interests: group.interests ?? [],
      creator_id: ownerId,
    })
    .select('id')
    .single();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(`groups insert (${group.slug}) failed: ${error.message}`);
  }
  return (data as { id: string }).id;
}

async function insertMembers(ctx: SeedContext, groupId: string, group: SeedGroup): Promise<void> {
  const ownerId = requireUser(ctx, group.owner);
  const joinedAt = new Date().toISOString();
  const active = (userId: string, role: 'owner' | 'member') => ({ group_id: groupId, user_id: userId, role, status: 'active', joined_at: joinedAt });
  const invited = group.invited ?? [];
  const rows = [
    active(ownerId, 'owner'),
    ...group.members.map((email) => active(requireUser(ctx, email), 'member')),
    ...invited.map((email) => ({ group_id: groupId, user_id: requireUser(ctx, email), role: 'member', status: 'invited', joined_at: null })),
  ];
  const { error } = await ctx.admin.from('group_members').insert(rows);
  if (error) throw new Error(`group_members insert (${group.slug}) failed: ${error.message}`);
  if (invited.length === 0) return;
  const invitations = invited.map((email) => ({ kind: 'group', group_id: groupId, sender_id: ownerId, recipient_id: requireUser(ctx, email) }));
  const { error: inviteError } = await ctx.admin.from('invitations').insert(invitations);
  if (inviteError) throw new Error(`invitations insert (${group.slug}) failed: ${inviteError.message}`);
}

/** Groups from groups.json. Returns 0 while the groups table is not migrated. */
export async function loadGroups(ctx: SeedContext): Promise<number> {
  const groups = await loadFixture('groups', seedGroupSchema);
  let inserted = 0;
  for (const group of groups) {
    const groupId = await insertGroup(ctx, group);
    if (groupId === null) {
      ctx.log('groups table not migrated yet (workstream 03); skipping groups');
      return 0;
    }
    await insertMembers(ctx, groupId, group);
    inserted += 1;
  }
  return inserted;
}

/** Connections from connections.json. */
export async function loadConnections(ctx: SeedContext): Promise<number> {
  const connections = await loadFixture('connections', seedConnectionSchema);
  const respondedAt = new Date().toISOString();
  const rows = connections.map((c) => ({
    requester_id: requireUser(ctx, c.requester),
    recipient_id: requireUser(ctx, c.recipient),
    status: c.status,
    message: c.message ?? null,
    responded_at: c.status === 'pending' ? null : respondedAt,
  }));
  const { error } = await ctx.admin.from('connections').insert(rows);
  if (error) {
    if (isMissingTable(error)) return 0;
    throw new Error(`connections insert failed: ${error.message}`);
  }
  return rows.length;
}

/** Blocks from blocks.json. */
export async function loadBlocks(ctx: SeedContext): Promise<number> {
  const blocks = await loadFixture('blocks', seedBlockSchema);
  const rows = blocks.map((b) => ({ blocker_id: requireUser(ctx, b.blocker), blocked_id: requireUser(ctx, b.blocked) }));
  const { error } = await ctx.admin.from('blocks').insert(rows);
  if (error) {
    if (isMissingTable(error)) return 0;
    throw new Error(`blocks insert failed: ${error.message}`);
  }
  return rows.length;
}
