import { isMissingTable, isSchemaMismatch, type AdminClient, type SeedContext } from './context';
import { AFTER_ALL, AFTER_EVENTS, AFTER_USERS, type ExtraLoader } from './loaders/registry';
import { loadBusinesses, loadEvents, loadGroups } from './loaders/domain';
import { loadNotifications } from './loaders/notifications';
import { deleteSeedUsers, loadUsers } from './loaders/users';

export type SeedSummary = {
  removedUsers: number;
  consumers: number;
  owners: number;
  businesses: number;
  events: number;
  groups: number;
  notifications: number;
  /** Rows inserted by registered extra loaders, keyed by loader name. */
  extra: Record<string, number>;
  durationMs: number;
};

function toPostgrestError(error: unknown): { code?: string; message?: string } {
  if (error && typeof error === 'object') return error as { code?: string; message?: string };
  return { message: error instanceof Error ? error.message : String(error) };
}

/** Run registered loaders; a missing table or column skips the loader instead of failing the seed. */
async function runExtras(ctx: SeedContext, loaders: ReadonlyArray<ExtraLoader>): Promise<Record<string, number>> {
  const results: Array<[string, number]> = [];
  for (const loader of loaders) {
    try {
      results.push([loader.name, await loader.run(ctx)]);
    } catch (error) {
      const pgError = toPostgrestError(error);
      if (!isMissingTable(pgError) && !isSchemaMismatch(pgError)) throw error;
      ctx.log(`${loader.name}: ${pgError.message}; skipping`);
      results.push([loader.name, 0]);
    }
  }
  return Object.fromEntries(results);
}

/**
 * Idempotent seed: deletes every `@weave.test` auth user (cascading to their rows), then
 * loads fixtures in dependency order. Tables owned by other workstreams are skipped until their
 * migrations land.
 */
export async function runSeedWith(admin: AdminClient, log: (message: string) => void = () => undefined): Promise<SeedSummary> {
  const started = Date.now();
  const ctx: SeedContext = { admin, usersByEmail: new Map(), businessesBySlug: new Map(), log };

  const removedUsers = await deleteSeedUsers(ctx);
  log(`removed ${removedUsers} previous seed users`);
  const { consumers, owners } = await loadUsers(ctx);
  log(`created ${consumers} consumers and ${owners} business owners`);
  const afterUsers = await runExtras(ctx, AFTER_USERS);
  const businesses = await loadBusinesses(ctx);
  const events = await loadEvents(ctx);
  const afterEvents = await runExtras(ctx, AFTER_EVENTS);
  const groups = await loadGroups(ctx);
  const notifications = await loadNotifications(ctx);
  const afterAll = await runExtras(ctx, AFTER_ALL);
  log(`businesses=${businesses} events=${events} groups=${groups} notifications=${notifications}`);

  return {
    removedUsers,
    consumers,
    owners,
    businesses,
    events,
    groups,
    notifications,
    extra: { ...afterUsers, ...afterEvents, ...afterAll },
    durationMs: Date.now() - started,
  };
}
