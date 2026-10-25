import 'server-only';
import { ApiError } from '@/lib/api/errors';
import type { Actor } from './http';

/** A text message between two accepted connections (P1, polled). */
export type DirectMessage = { id: string; connectionId: string; senderId: string; body: string; createdAt: string; mine: boolean };

const PAGE = 50;

type Row = { id: string; connection_id: string; sender_id: string; body: string; created_at: string };

const toMessage = (row: Row, viewerId: string): DirectMessage => ({
  id: row.id,
  connectionId: row.connection_id,
  senderId: row.sender_id,
  body: row.body,
  createdAt: row.created_at,
  mine: row.sender_id === viewerId,
});

async function requireAccepted(actor: Actor, connectionId: string): Promise<void> {
  const { data, error } = await actor.supabase.from('connections').select('status').eq('id', connectionId).maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Could not load the conversation', 500);
  if (!data) throw new ApiError('NOT_FOUND', 'Conversation not found', 404);
  if (data.status !== 'accepted') throw new ApiError('FORBIDDEN', 'You can message people once you’re connected', 403);
}

/**
 * GET /api/connections/:id/messages: the latest 50 messages oldest-first, or with `after` the
 * messages newer than that timestamp (what the polling UI asks for).
 */
export async function listMessages(actor: Actor, connectionId: string, after?: string): Promise<DirectMessage[]> {
  await requireAccepted(actor, connectionId);
  const base = actor.supabase.from('direct_messages').select('*').eq('connection_id', connectionId);
  const { data, error } = after
    ? await base.gt('created_at', after).order('created_at', { ascending: true }).limit(PAGE)
    : await base.order('created_at', { ascending: false }).limit(PAGE);
  if (error) throw new ApiError('INTERNAL', 'Could not load messages', 500);
  const rows = (data ?? []) as Row[];
  return (after ? rows : [...rows].reverse()).map((row) => toMessage(row, actor.userId));
}

/** POST /api/connections/:id/messages: send a text message (RLS re-checks the connection). */
export async function sendMessage(actor: Actor, connectionId: string, body: string): Promise<DirectMessage> {
  await requireAccepted(actor, connectionId);
  const { data, error } = await actor.supabase
    .from('direct_messages')
    .insert({ connection_id: connectionId, sender_id: actor.userId, body })
    .select('*')
    .single();
  if (error || !data) throw new ApiError('FORBIDDEN', 'You can message people once you’re connected', 403);
  return toMessage(data as Row, actor.userId);
}
