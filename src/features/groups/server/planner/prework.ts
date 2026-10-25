import { centroid, normalizeTags, resolveCategories, toLatLng, type LatLng, type MatchingPreferences } from '@/features/matching';
import { AVAILABILITY_SLOT, type AvailabilitySlot, type EventCategory, type GroupSizePref } from '@/shared/enums';

/**
 * Deterministic pre-work for the group planner (spec §5 step 3). Everything here is aggregated:
 * the result carries counts, intersections and a centroid, never a user id or an individual row.
 */
export type Prework = {
  memberCount: number;
  sharedSlots: AvailabilitySlot[];
  budgetMaxCents: number | null;
  interests: Array<{ tag: string; count: number }>;
  categories: Array<{ category: EventCategory; count: number }>;
  activityPrefs: Array<{ tag: string; count: number }>;
  groupSizePref: GroupSizePref | null;
  neighborhood: string | null;
  center: LatLng | null;
  /** Set when the plan uses slots not every member can make (see `chooseSlots`). */
  availability?: { everyoneFree: boolean; freeCounts: Partial<Record<AvailabilitySlot, number>> };
};

type HasSlots = { availabilitySlots: readonly AvailabilitySlot[] };

/** Slots every member is free in, in week order. */
export function intersectSlots(members: readonly HasSlots[]): AvailabilitySlot[] {
  if (members.length === 0) return [];
  return AVAILABILITY_SLOT.filter((slot) => members.every((m) => m.availabilitySlots.includes(slot)));
}

/** The smallest stated maximum budget (the group can only spend what everyone can); null if none stated. */
export function budgetEnvelope(members: ReadonlyArray<{ budgetMax: number | null }>): number | null {
  const maxes = members.map((m) => m.budgetMax).filter((v): v is number => v !== null && v !== undefined);
  return maxes.length === 0 ? null : Math.min(...maxes);
}

/** How many lists contain each value (once per list), most common first, ties alphabetical. */
export function countValues(lists: ReadonlyArray<readonly string[]>): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const list of lists) for (const value of new Set(list)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** Most common non-null value, ties alphabetical; null when there is none. */
export function modeOf<T extends string>(values: ReadonlyArray<T | null>): T | null {
  const top = countValues(values.filter((v): v is T => v !== null).map((v) => [v]))[0];
  return top ? (top.value as T) : null;
}

export function buildPrework(members: readonly MatchingPreferences[]): Prework {
  const points = members.map((m) => toLatLng(m.coarseLat, m.coarseLng)).filter((p): p is LatLng => p !== null);
  return {
    memberCount: members.length,
    sharedSlots: intersectSlots(members),
    budgetMaxCents: budgetEnvelope(members),
    interests: countValues(members.map((m) => normalizeTags(m.interests))).map(({ value, count }) => ({ tag: value, count })),
    categories: countValues(members.map((m) => resolveCategories(m.interests, m.interestCategories))).map(({ value, count }) => ({
      category: value as EventCategory,
      count,
    })),
    activityPrefs: countValues(members.map((m) => normalizeTags(m.activityPrefs))).map(({ value, count }) => ({ tag: value, count })),
    groupSizePref: modeOf(members.map((m) => m.groupSizePref ?? null)),
    neighborhood: modeOf(members.map((m) => m.neighborhood)),
    center: centroid(points),
  };
}
