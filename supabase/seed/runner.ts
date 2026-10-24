import type { AdminClient, SeedContext } from './context';
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
  durationMs: number;
};

/**
 * Idempotent seed: deletes every `@commonground.test` auth user (cascading to their rows), then
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
  const businesses = await loadBusinesses(ctx);
  const events = await loadEvents(ctx);
  const groups = await loadGroups(ctx);
  const notifications = await loadNotifications(ctx);
  log(`businesses=${businesses} events=${events} groups=${groups} notifications=${notifications}`);

  return { removedUsers, consumers, owners, businesses, events, groups, notifications, durationMs: Date.now() - started };
}
