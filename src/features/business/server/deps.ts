import 'server-only';
import { logAgentAction, notify } from '@/features/core';
import { withEventSms } from '@/features/events';
import { VENUE_TIMEZONE } from './time';
import type { BusinessStore } from './store';

/**
 * Everything a 05 use case needs from the outside world, passed explicitly. Routes build
 * this once per request; tests pass an in-memory store and recording notifiers.
 *
 * `notify` and `logAgentAction` are workstream 01's real exports (README §4); 05's stubs
 * for them were deleted when 01 merged.
 */
export type NotifyFn = typeof notify;
export type LogAgentActionFn = typeof logAgentAction;

export type BusinessDeps = {
  store: BusinessStore;
  /**
   * The signed-in owner acting, for `agent_action_log.user_id`, which references
   * `profiles(id)`. Null for a worker run. Never a business id: that is a different table
   * and the insert is rejected by the foreign key.
   */
  actorUserId: string | null;
  notify: NotifyFn;
  logAgentAction: LogAgentActionFn;
  now: () => Date;
  timezone: string;
};

export type DepsOverrides = Partial<Omit<BusinessDeps, 'store'>> & { store: BusinessStore };

export const makeDeps = (overrides: DepsOverrides): BusinessDeps => ({
  actorUserId: null,
  // Attendee updates and cancellations also text the demo phone when 06's SMS is configured.
  notify: withEventSms(notify),
  logAgentAction,
  now: () => new Date(),
  timezone: VENUE_TIMEZONE,
  ...overrides,
});
