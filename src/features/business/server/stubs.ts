import 'server-only';
import type { NotificationType } from '@/shared/enums';

/**
 * Contracts workstream 05 consumes but does not own (specs/README.md section 4). Each stub
 * satisfies the real signature so the call sites never change; delete a stub the moment the
 * real export lands via a sync.
 *
 * Owner: workstream 01 (`src/features/core`).
 */

export type NotifyFn = (
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
) => Promise<void>;

export type LogAgentActionFn = (input: {
  userId: string;
  action: string;
  permissionsUsed: string[];
  result: string;
}) => Promise<void>;

type NotificationSink = {
  insert: (rows: { user_id: string; type: string; payload: unknown }[]) => Promise<{ error: unknown }>;
};

/**
 * STUB for 01's `notify()`. Writes the same `notifications` row 01's helper will write, so
 * the demo works end to end; a missing table (01 not merged yet) is logged, never thrown,
 * because a notification must not fail a publish.
 */
export const makeNotify = (sink: () => NotificationSink | null): NotifyFn =>
  async function notify(userId, type, payload) {
    const table = sink();
    if (!table) return;
    const { error } = await table.insert([{ user_id: userId, type, payload }]);
    if (error) {
      console.warn('[ws05] notify stub could not write a notification', { type, error });
    }
  };

/** STUB for 01's `logAgentAction()`. */
export const makeLogAgentAction = (sink: () => NotificationSink | null): LogAgentActionFn =>
  async function logAgentAction(input) {
    const table = sink();
    if (!table) {
      console.info('[ws05] agent action', input);
      return;
    }
    const { error } = await table.insert([
      { user_id: input.userId, type: input.action, payload: input },
    ]);
    if (error) {
      console.warn('[ws05] agent action log stub could not write a row', { action: input.action, error });
    }
  };

/** No-op pair for unit tests and for routes that run before 01's helpers exist. */
export const noopNotify: NotifyFn = async () => {};
export const noopLogAgentAction: LogAgentActionFn = async () => {};
