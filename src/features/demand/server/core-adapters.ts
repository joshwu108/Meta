import 'server-only';
import { logAgentAction, notify } from '@/features/core';
import { log } from '@/lib/log';
import type { NotificationType } from '@/shared/enums';
import type { ActionLogEntry } from './deps';

/** 01's `logAgentAction` writes one row per call; this bounds the parallel inserts per batch. */
const LOG_CHUNK = 25;

/**
 * 01's `notify` rethrows database errors. A proposal is already stored when the owner is
 * notified, so a failed notification is logged instead of failing the run (AC5).
 */
export async function notifyOwner(userId: string, type: NotificationType, payload: Record<string, unknown>): Promise<void> {
  try {
    await notify(userId, type, payload);
  } catch (error) {
    log.error('demand.notify_failed', { type, error: error instanceof Error ? error.message : String(error) });
  }
}

/** Spec §5.1 `collect_signals` and §5.9 `generate_proposal` audit rows through 01's contract. */
export async function logActions(entries: readonly ActionLogEntry[]): Promise<void> {
  for (let i = 0; i < entries.length; i += LOG_CHUNK) {
    await Promise.all(
      entries.slice(i, i + LOG_CHUNK).map((e) =>
        logAgentAction({ userId: e.userId, actor: e.actor, action: e.action, permissionsUsed: e.permissionsUsed, result: e.result }),
      ),
    );
  }
}
