import type { GroupSchedule } from '@/features/agent';
import type { AvailabilitySlot } from '@/shared/enums';

/** Which slots a plan may use, and how many consenting members are free in each. */
export type SlotPlan = {
  slots: AvailabilitySlot[];
  freeCounts: Partial<Record<AvailabilitySlot, number>>;
  everyoneFree: boolean;
};

const MIN_FREE = 2;
const QUORUM_SHARE = 0.5;

/**
 * Slots everyone shares when there are any. Otherwise the slots 02's `resolveGroupSchedule` ranks
 * highest, as long as at least half the consenting members (and never fewer than two) can make them.
 */
export function chooseSlots(sharedSlots: readonly AvailabilitySlot[], schedule: GroupSchedule, memberCount: number): SlotPlan {
  if (sharedSlots.length > 0) {
    return { slots: [...sharedSlots], freeCounts: Object.fromEntries(sharedSlots.map((s) => [s, memberCount])), everyoneFree: true };
  }
  const quorum = Math.max(MIN_FREE, Math.ceil(memberCount * QUORUM_SHARE));
  const best = schedule.options.filter((option) => option.available.length >= quorum);
  return {
    slots: best.map((option) => option.slot),
    freeCounts: Object.fromEntries(best.map((option) => [option.slot, option.available.length])),
    everyoneFree: false,
  };
}
