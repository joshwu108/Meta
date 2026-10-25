import type { AvailabilitySlot, EventCategory } from '@/shared/enums';
import { categoriesFor, type DemandUser } from './categories';
import type { DemandConfig } from './config';
import { areNeighbors, cellId, centroid, haversineKm, toCell, type Cell } from './geo';

/** A user with everything clustering needs; produced by `filterUsers`. */
export type LocatedUser = DemandUser & { coarseLat: number; coarseLng: number; categories: EventCategory[] };

export type RawCluster = {
  category: EventCategory;
  slot: AvailabilitySlot;
  /** Cell id of the seed (largest) cell; used in the dedup signature. */
  geocell: string;
  center: { lat: number; lng: number };
  members: readonly LocatedUser[];
};

/** Spec §5.2: drop users with no slots, no categories, or no coarse coordinates. */
export function filterUsers(users: readonly DemandUser[]): LocatedUser[] {
  return users.flatMap((u) => {
    const categories = categoriesFor(u);
    if (u.availabilitySlots.length === 0 || categories.length === 0) return [];
    if (u.coarseLat == null || u.coarseLng == null) return [];
    return [{ ...u, coarseLat: u.coarseLat, coarseLng: u.coarseLng, categories }];
  });
}

type CellGroup = { cell: Cell; members: LocatedUser[] };

const point = (u: LocatedUser) => ({ lat: u.coarseLat, lng: u.coarseLng });

function withinEveryRadius(members: readonly LocatedUser[]): boolean {
  const c = centroid(members.map(point));
  return members.every((m) => haversineKm(c, point(m)) <= m.travelRadiusKm);
}

/** Grows a cluster from the largest cell by absorbing neighbor cells while everyone can still reach the centroid. */
function mergeCells(groups: readonly CellGroup[]): CellGroup[][] {
  const remaining = [...groups].sort((a, b) => b.members.length - a.members.length || a.cell.row - b.cell.row || a.cell.col - b.cell.col);
  const clusters: CellGroup[][] = [];
  while (remaining.length > 0) {
    const cluster = [remaining.shift() as CellGroup];
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < remaining.length; i += 1) {
        const candidate = remaining[i] as CellGroup;
        if (!cluster.some((g) => areNeighbors(g.cell, candidate.cell))) continue;
        if (!withinEveryRadius([...cluster, candidate].flatMap((g) => g.members))) continue;
        cluster.push(candidate);
        remaining.splice(i, 1);
        grew = true;
        break;
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

/**
 * Spec §5.3: one signal per (category, slot, geocell), then 8-neighborhood radius merge.
 * Each user has a single location, so they land in at most one cluster per (category, slot).
 */
export function clusterUsers(users: readonly LocatedUser[], config: Pick<DemandConfig, 'geocellDegrees'>): RawCluster[] {
  const buckets = new Map<string, { category: EventCategory; slot: AvailabilitySlot; cells: Map<string, CellGroup> }>();
  for (const user of users) {
    const cell = toCell(user.coarseLat, user.coarseLng, config.geocellDegrees);
    const id = cellId(cell, config.geocellDegrees);
    for (const category of user.categories) {
      for (const slot of user.availabilitySlots) {
        const key = `${category}|${slot}`;
        const bucket = buckets.get(key) ?? { category, slot, cells: new Map() };
        const group = bucket.cells.get(id) ?? { cell, members: [] };
        bucket.cells.set(id, { cell, members: [...group.members, user] });
        buckets.set(key, bucket);
      }
    }
  }
  return [...buckets.values()].flatMap((bucket) =>
    mergeCells([...bucket.cells.values()]).map((groups) => {
      const members = groups.flatMap((g) => g.members);
      return {
        category: bucket.category,
        slot: bucket.slot,
        geocell: cellId((groups[0] as CellGroup).cell, config.geocellDegrees),
        center: centroid(members.map(point)),
        members,
      };
    }),
  );
}
