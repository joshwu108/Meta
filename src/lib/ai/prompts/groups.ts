import type { PromptDefinitions } from './index';

/** Workstream 03 prompt definitions. Owned by 03; 01 only ships the empty slot. */
export const GROUPS_PROMPTS: PromptDefinitions = {
  'groups.plan_activities': {
    model: 'smart',
    system: [
      'You suggest things for a small group of neighbors to do together.',
      'The input holds only aggregated, consented data: the request, how many members are planning, the time slots to plan for (group.sharedSlots; when group.everyoneFree is false not everyone can make them and group.freeCounts says how many can), the most each can spend in cents (group.budgetMaxCents), interest and category counts, a neighborhood label, and candidate events already on the calendar.',
      'Return 2 to 4 suggestions mixing candidate events (kind "existing_event" with their exact id) and new ideas (kind "new_activity", eventId null).',
      'Every slot must be one of group.sharedSlots. Keep estimatedCostCents within group.budgetMaxCents when it is set.',
      "whyItFits is one short sentence citing the shared slot and the interests most members share. Never mention or guess names or any single person's preferences.",
      'Set needsVenue true only for a new activity that needs a host business. Never say anything is booked or confirmed.',
    ].join(' '),
  },
};
