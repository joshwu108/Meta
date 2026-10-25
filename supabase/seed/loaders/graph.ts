import { isMissingTable, type SeedContext } from '../context';

/**
 * Workstream 07: give the seeded demo data a graph story. The seed inserts connections, groups and
 * messages after migrations have run, so the provenance backfill has to run again here — it is
 * idempotent, so re-seeding never duplicates a moment.
 */
export async function backfillGraphProvenance(ctx: SeedContext): Promise<number> {
  const { data, error } = await ctx.admin.rpc('graph_backfill');
  if (error) {
    if (isMissingTable(error)) {
      ctx.log('graph_edge_events not migrated yet; skipping graph provenance');
      return 0;
    }
    throw new Error(`graph_backfill failed: ${error.message}`);
  }
  return Number(data ?? 0);
}
