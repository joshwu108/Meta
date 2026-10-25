import 'server-only';
import { logAgentAction, notify } from '@/features/core';
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
  notify: NotifyFn;
  logAgentAction: LogAgentActionFn;
  now: () => Date;
  timezone: string;
};

export type DepsOverrides = Partial<Omit<BusinessDeps, 'store'>> & { store: BusinessStore };

export const makeDeps = (overrides: DepsOverrides): BusinessDeps => ({
  notify,
  logAgentAction,
  now: () => new Date(),
  timezone: VENUE_TIMEZONE,
  ...overrides,
});
