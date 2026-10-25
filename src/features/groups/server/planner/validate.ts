import type { AvailabilitySlot } from '@/shared/enums';
import type { PlanSuggestion } from '@/shared/schemas/social';

export const MAX_SUGGESTIONS = 4;
export const MIN_SUGGESTIONS = 2;

export type ValidationContext = {
  sharedSlots: readonly AvailabilitySlot[];
  candidateEventIds: ReadonlySet<string>;
};

/**
 * Spec §5 step 6: an `existing_event` must point at one of the candidate events, every slot must
 * be one the consenting members share; anything else is dropped. New activities never carry an
 * event id, existing events never need a venue, duplicate titles are removed, four at most.
 */
export function validateSuggestions(suggestions: readonly PlanSuggestion[], ctx: ValidationContext): PlanSuggestion[] {
  const seen = new Set<string>();
  return suggestions
    .filter((s) => ctx.sharedSlots.includes(s.slot))
    .filter((s) => s.kind === 'new_activity' || (s.eventId !== null && ctx.candidateEventIds.has(s.eventId)))
    .map((s) => (s.kind === 'new_activity' ? { ...s, eventId: null } : { ...s, needsVenue: false }))
    .filter((s) => {
      const key = s.title.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SUGGESTIONS);
}
