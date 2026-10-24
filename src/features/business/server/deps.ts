import 'server-only';
import { VENUE_TIMEZONE } from './time';
import type { BusinessStore } from './store';
import { noopLogAgentAction, noopNotify, type LogAgentActionFn, type NotifyFn } from './stubs';

/**
 * Everything a 05 use case needs from the outside world, passed explicitly. Routes build
 * this once per request; tests pass an in-memory store and recording notifiers.
 */
export type BusinessDeps = {
  store: BusinessStore;
  notify: NotifyFn;
  logAgentAction: LogAgentActionFn;
  now: () => Date;
  timezone: string;
};

export type DepsOverrides = Partial<Omit<BusinessDeps, 'store'>> & { store: BusinessStore };

export const makeDeps = (overrides: DepsOverrides): BusinessDeps => ({
  notify: noopNotify,
  logAgentAction: noopLogAgentAction,
  now: () => new Date(),
  timezone: VENUE_TIMEZONE,
  ...overrides,
});
