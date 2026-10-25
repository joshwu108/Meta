import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import { logAgentActionInputSchema, type LogAgentActionInput } from '@/shared/schemas/agent-action-log';

/** Postgres foreign-key violation. */
const FK_VIOLATION = '23503';

/**
 * Append an audit row to `agent_action_log` (README §4 contract). `result` must be a short
 * human-readable summary without PII.
 *
 * `userId` must be a **user's** id (`profiles.id` = `auth.users.id`), or null for system runs.
 * Passing a business id, event id or any other id violates the foreign key and the row is not
 * written.
 *
 * Never throws: an audit failure must not break the user-facing action that triggered it.
 * Instead it resolves to `false` when nothing was recorded (and logs why), so callers and tests
 * can assert `expect(await logAgentAction(...)).toBe(true)`.
 */
export async function logAgentAction(input: LogAgentActionInput): Promise<boolean> {
  const parsed = logAgentActionInputSchema.safeParse(input);
  if (!parsed.success) {
    log.error('agent_log.invalid_input', { issues: parsed.error.issues });
    return false;
  }
  const row = parsed.data;
  const admin = createAdminClient();
  const { error } = await admin.from('agent_action_log').insert({
    user_id: row.userId ?? null,
    actor: row.actor,
    action: row.action,
    permissions_used: row.permissionsUsed,
    result: row.result,
    metadata: row.metadata as never,
  });
  if (error) {
    const hint =
      error.code === FK_VIOLATION ? 'userId is not a profiles.id; pass the acting user id (or null), never a business or event id' : undefined;
    log.error('agent_log.insert_failed', { action: row.action, code: error.code, detail: error.message, hint });
    return false;
  }
  log.info('agent_log.recorded', { userId: row.userId ?? undefined, actor: row.actor, action: row.action });
  return true;
}
