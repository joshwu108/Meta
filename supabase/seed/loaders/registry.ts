import type { SeedContext } from '../context';
import { loadAgentPreferences } from '../agent';
import { loadRsvps } from './rsvps';
import { loadBlocks, loadConnections } from './social';

/**
 * Extension points for loaders owned by other workstreams. Each workstream imports its loader
 * here and pushes one entry; `runner.ts` runs them in order and skips any whose table is
 * missing. Keep entries one per line so merges do not collide.
 */
export type ExtraLoader = { name: string; run: (ctx: SeedContext) => Promise<number> };

/** Runs after consumers and owners exist (02: `loadAgentPreferences`). */
export const AFTER_USERS: ReadonlyArray<ExtraLoader> = [
  { name: 'agent preferences (02)', run: loadAgentPreferences },
];

/** Runs after businesses and events exist (06: `loadRsvps`; 04: demand clusters). */
export const AFTER_EVENTS: ReadonlyArray<ExtraLoader> = [
  { name: 'rsvps', run: (ctx) => loadRsvps(ctx) },
];

/** Runs last (03: connections, invitations; anything that needs every other table). */
export const AFTER_ALL: ReadonlyArray<ExtraLoader> = [
  { name: 'connections', run: loadConnections },
  { name: 'blocks', run: loadBlocks },
];
