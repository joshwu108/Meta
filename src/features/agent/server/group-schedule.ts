import { AVAILABILITY_SLOT, type AvailabilitySlot } from "@/shared/enums";
import type { SharablePreferences } from "@/shared/types";

export type SlotOption = { slot: AvailabilitySlot; available: string[]; missing: string[] };
export type GroupSchedule = {
  /** Slots ordered by how many members are free, then canonical week order. */
  options: SlotOption[];
  /** Best slot everyone can make, or null when there is a conflict. */
  unanimous: AvailabilitySlot | null;
  /** Shared budget ceiling in cents (lowest stated max), null if nobody stated one. */
  budgetMaxCents: number | null;
};

/**
 * P1: resolve group scheduling conflicts for 03's planner. Input must come from
 * `getSharablePreferences(id, 'group_plan')`; members who did not consent are
 * simply absent and never counted.
 */
export function resolveGroupSchedule(members: readonly SharablePreferences[], maxOptions = 3): GroupSchedule {
  if (members.length === 0) return { options: [], unanimous: null, budgetMaxCents: null };
  const options = AVAILABILITY_SLOT.map((slot) => {
    const available = members.filter((m) => m.availabilitySlots.includes(slot)).map((m) => m.userId);
    return { slot, available, missing: members.map((m) => m.userId).filter((id) => !available.includes(id)) };
  })
    .filter((o) => o.available.length > 0)
    .sort((a, b) => b.available.length - a.available.length || AVAILABILITY_SLOT.indexOf(a.slot) - AVAILABILITY_SLOT.indexOf(b.slot))
    .slice(0, maxOptions);
  const unanimous = options.find((o) => o.missing.length === 0)?.slot ?? null;
  const budgets = members.map((m) => m.budgetMax).filter((b): b is number => b != null);
  return { options, unanimous, budgetMaxCents: budgets.length ? Math.min(...budgets) : null };
}
