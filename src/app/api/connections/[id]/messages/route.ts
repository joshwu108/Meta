import { ok, parseBody, parseQuery, withAuth } from '@/lib/api';
import { pathId } from '@/features/matching/server/http';
import { listMessages, sendMessage } from '@/features/matching/server/messages';
import { messageCreateSchema, messageListQuerySchema } from '@/shared/schemas/social';

/** GET /api/connections/:id/messages?after= — P1 polled conversation between accepted connections. */
export const GET = withAuth(async ({ user, supabase }, req, params) => {
  const id = pathId(params, 'id', 'Conversation');
  const { after } = parseQuery(messageListQuerySchema, req.url);
  const messages = await listMessages({ userId: user.id, supabase }, id, after);
  return ok(messages, { total: messages.length });
});

/** POST /api/connections/:id/messages — `{ body }` (text only, ≤ 1000 characters). */
export const POST = withAuth(async ({ user, supabase }, req, params) => {
  const id = pathId(params, 'id', 'Conversation');
  const { body } = await parseBody(messageCreateSchema, req);
  return ok(await sendMessage({ userId: user.id, supabase }, id, body), undefined, { status: 201 });
});
