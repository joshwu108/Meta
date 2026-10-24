import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import { logAgentActionInputSchema, type LogAgentActionInput } from '@/shared/schemas/agent-action-log';

/**
 * Append an audit row to `agent_action_log` (README §4 contract). `result` must be a short
 * human-readable summary without PII. Never throws: an audit failure is logged but must not
 * break the user-facing action that triggered it.
 */
export async function logAgentAction(input: LogAgentActionInput): Promise<void> {
  const parsed = logAgentActionInputSchema.safeParse(input);
  if (!parsed.success) {
    log.error('agent_log.invalid_input', { issues: parsed.error.issues });
    return;
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
    log.error('agent_log.insert_failed', { action: row.action, code: error.code, detail: error.message });
    return;
  }
  log.info('agent_log.recorded', { userId: row.userId ?? undefined, actor: row.actor, action: row.action });
}
