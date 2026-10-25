import 'server-only';
import { ApiError } from '@/lib/api/errors';
import { log } from '@/lib/log';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ReportReason } from '@/shared/schemas/social';
import { getPublicCard } from './cards';
import type { Actor } from './http';
import { invalidateMatches } from './matches';

async function requireTarget(actor: Actor, targetId: string, verb: string): Promise<void> {
  if (targetId === actor.userId) throw new ApiError('VALIDATION', `You cannot ${verb} yourself`, 400);
  if (!(await getPublicCard(targetId))) throw new ApiError('NOT_FOUND', 'User not found', 404);
}

/**
 * POST /api/users/:id/block. Atomic: records the block, ends any pending or accepted connection
 * and expires pending invitations between the pair. Blocked users vanish from recommendations
 * and invite pickers in both directions. Idempotent.
 */
export async function blockUser(actor: Actor, targetId: string): Promise<{ blocked: true }> {
  await requireTarget(actor, targetId, 'block');
  const { error } = await createAdminClient().rpc('block_user', { p_blocker: actor.userId, p_blocked: targetId });
  if (error) throw new ApiError('INTERNAL', 'Could not block this user', 500);
  invalidateMatches(actor.userId, targetId);
  log.info('safety.block', { userId: actor.userId });
  return { blocked: true };
}

/** POST /api/users/:id/report. Stored for moderation; reporters cannot read reports back. */
export async function reportUser(actor: Actor, targetId: string, input: { reason: ReportReason; details?: string }): Promise<{ id: string }> {
  await requireTarget(actor, targetId, 'report');
  // Reporters have no read policy on reports, so the id is generated here instead of returned.
  const id = crypto.randomUUID();
  const { error } = await actor.supabase
    .from('reports')
    .insert({ id, reporter_id: actor.userId, reported_id: targetId, reason: input.reason, details: input.details ?? null });
  if (error) throw new ApiError('INTERNAL', 'Could not send the report', 500);
  log.warn('safety.report', { userId: actor.userId, reason: input.reason });
  return { id };
}
