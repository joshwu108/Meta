import 'server-only';
import { notify } from '@/features/core';
import { ApiError } from '@/lib/api/errors';
import { log } from '@/lib/log';
import type { ConnectionStatus } from '@/shared/enums';
import type { ConnectionRow } from '@/shared/schemas/social';
import { getPublicCard, getPublicCards, unknownCard, type PublicCard } from './cards';
import { PG, type Actor } from './http';
import { invalidateMatches } from './matches';
import { canReach, getBlockedIds, getBlockEdges, isBlockedEitherWay } from './social-graph';

/** A connection as one side sees it, with the other person's public card. */
export type ConnectionItem = {
  id: string;
  status: ConnectionStatus;
  direction: 'incoming' | 'outgoing';
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
  user: PublicCard;
};

const UNAVAILABLE = 'This person is not available to connect';

function toItem(row: ConnectionRow, viewerId: string, card: PublicCard): ConnectionItem {
  return {
    id: row.id,
    status: row.status,
    direction: row.recipient_id === viewerId ? 'incoming' : 'outgoing',
    message: row.message,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    user: card,
  };
}

async function findEdge(actor: Actor, otherId: string): Promise<ConnectionRow | null> {
  const { data, error } = await actor.supabase
    .from('connections')
    .select('*')
    .or(`and(requester_id.eq.${actor.userId},recipient_id.eq.${otherId}),and(requester_id.eq.${otherId},recipient_id.eq.${actor.userId})`)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Could not load connection', 500);
  return data as ConnectionRow | null;
}

function edgeConflict(edge: ConnectionRow, actorId: string): ApiError {
  const incoming = edge.recipient_id === actorId && edge.status === 'pending';
  const message = incoming
    ? 'They already sent you a request. Accept it from Requests.'
    : edge.status === 'accepted'
      ? 'You are already connected'
      : 'A request between you already exists';
  return new ApiError('CONFLICT', message, 409, { connectionId: edge.id, status: edge.status, direction: incoming ? 'incoming' : 'outgoing' });
}

/** POST /api/connections: send a request; CONFLICT if any edge exists; notifies the recipient. */
export async function sendConnectionRequest(actor: Actor, input: { recipientId: string; message?: string }): Promise<ConnectionItem> {
  if (input.recipientId === actor.userId) throw new ApiError('VALIDATION', 'You cannot connect with yourself', 400);
  const [recipient, edges] = await Promise.all([getPublicCard(input.recipientId), getBlockEdges(actor.userId)]);
  if (!recipient || isBlockedEitherWay(edges, actor.userId, input.recipientId)) throw new ApiError('NOT_FOUND', UNAVAILABLE, 404);
  if (!(await canReach(actor.userId, input.recipientId))) throw new ApiError('NOT_FOUND', UNAVAILABLE, 404);
  const existing = await findEdge(actor, input.recipientId);
  if (existing) throw edgeConflict(existing, actor.userId);

  const { data, error } = await actor.supabase
    .from('connections')
    .insert({ requester_id: actor.userId, recipient_id: input.recipientId, message: input.message ?? null })
    .select('*')
    .single();
  if (error?.code === PG.uniqueViolation) throw new ApiError('CONFLICT', 'A request between you already exists', 409);
  if (error || !data) throw new ApiError('NOT_FOUND', UNAVAILABLE, 404);

  const requester = await getPublicCard(actor.userId);
  await notify(input.recipientId, 'connection_request', {
    title: `${requester?.displayName ?? 'Someone'} wants to connect`,
    ...(input.message ? { body: input.message } : {}),
    connectionId: data.id,
    requesterId: actor.userId,
  });
  invalidateMatches(actor.userId, input.recipientId);
  return toItem(data as ConnectionRow, actor.userId, recipient);
}

/** PATCH /api/connections/:id: only the recipient answers, only while pending. */
export async function respondToConnection(actor: Actor, connectionId: string, status: 'accepted' | 'declined'): Promise<ConnectionItem> {
  const { data: row, error } = await actor.supabase.from('connections').select('*').eq('id', connectionId).maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Could not load connection', 500);
  if (!row) throw new ApiError('NOT_FOUND', 'Connection request not found', 404);
  if (row.recipient_id !== actor.userId) throw new ApiError('FORBIDDEN', 'Only the person who received this request can answer it', 403);
  if (row.status !== 'pending') throw new ApiError('CONFLICT', 'This request was already answered', 409);

  const { data: updated, error: updateError } = await actor.supabase
    .from('connections')
    .update({ status })
    .eq('id', connectionId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  if (updateError) throw new ApiError('INTERNAL', 'Could not answer the request', 500);
  if (!updated) throw new ApiError('CONFLICT', 'This request was already answered', 409);

  const requester = (await getPublicCard(row.requester_id)) ?? unknownCard(row.requester_id);
  if (status === 'accepted') {
    const me = await getPublicCard(actor.userId);
    await notify(row.requester_id, 'connection_accepted', {
      title: `${me?.displayName ?? 'Someone'} accepted your request`,
      connectionId,
      userId: actor.userId,
    });
  }
  invalidateMatches(actor.userId, row.requester_id);
  log.info('connections.answered', { userId: actor.userId, status });
  return toItem(updated as ConnectionRow, actor.userId, requester);
}

/** GET /api/connections: both directions, newest first, never across a block. */
export async function listConnections(actor: Actor, status?: ConnectionStatus): Promise<ConnectionItem[]> {
  let query = actor.supabase.from('connections').select('*').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const [{ data, error }, blocked] = await Promise.all([query, getBlockedIds(actor.userId)]);
  if (error) throw new ApiError('INTERNAL', 'Could not load connections', 500);
  const rows = ((data ?? []) as ConnectionRow[]).filter((row) => {
    const other = row.requester_id === actor.userId ? row.recipient_id : row.requester_id;
    return !blocked.has(other);
  });
  const others = rows.map((row) => (row.requester_id === actor.userId ? row.recipient_id : row.requester_id));
  const cards = await getPublicCards(others);
  return rows.map((row, index) => toItem(row, actor.userId, cards.get(others[index]!) ?? unknownCard(others[index]!)));
}
