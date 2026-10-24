import { EVENT_CATEGORY, type AvailabilitySlot, type EventCategory } from '@/shared/enums';
import { CATEGORY_PHRASES, SLOT_PHRASES } from '@/shared/labels';
import type { PlanSuggestion } from '@/shared/schemas/social';
import type { Prework } from './prework';
import { MAX_SUGGESTIONS, MIN_SUGGESTIONS } from './validate';

/** An upcoming event (from 06) that fits the group's shared slots and interests. */
export type CandidateEvent = {
  id: string;
  title: string;
  category: EventCategory;
  slot: AvailabilitySlot;
  startsAt: string;
  venue: string;
  priceCents: number | null;
};

const IDEAS: Readonly<Record<EventCategory, { title: string; description: string; costCents: number }>> = {
  creative: { title: 'Hands-on craft night', description: 'A relaxed making session (pottery, painting or zines) with enough guidance that beginners leave with something they made.', costCents: 2000 },
  food_drink: { title: 'Coffee tasting meetup', description: 'Try a few roasts side by side at a neighborhood café and compare notes.', costCents: 1500 },
  games: { title: 'Board game night', description: 'Easy-to-learn games at small tables so everyone gets to talk.', costCents: 1000 },
  outdoors: { title: 'Neighborhood walk and picnic', description: 'An easy loop through a nearby park, ending with snacks on the grass.', costCents: 0 },
  fitness: { title: 'Easy group run', description: 'A conversational-pace run, then coffee together.', costCents: 0 },
  learning: { title: 'Skill-swap evening', description: 'Everyone teaches something small in ten minutes.', costCents: 0 },
  music: { title: 'Live music outing', description: 'Catch a local set together and grab food after.', costCents: 2000 },
  community: { title: 'Volunteer morning', description: 'Help out at a local community project, then grab brunch.', costCents: 0 },
};

function share(count: number, total: number): string {
  return count >= total ? 'All of you' : `${count} of ${total} of you`;
}

function categoryCount(prework: Prework, category: EventCategory): number {
  return prework.categories.find((c) => c.category === category)?.count ?? 0;
}

/** Deterministic `existing_event` suggestion built from the event and the group's aggregates. */
export function existingEventSuggestion(event: CandidateEvent, prework: Prework): PlanSuggestion {
  const count = categoryCount(prework, event.category);
  const interest = count > 0 ? `, and ${share(count, prework.memberCount).toLowerCase()} like ${CATEGORY_PHRASES[event.category]}` : '';
  return {
    kind: 'existing_event',
    eventId: event.id,
    title: event.title.slice(0, 120),
    description: `Already on the calendar at ${event.venue}. Each of you RSVPs on your own.`.slice(0, 300),
    category: event.category,
    slot: event.slot,
    estimatedCostCents: event.priceCents,
    whyItFits: `It falls on ${SLOT_PHRASES[event.slot]}, when everyone is free${interest}.`.slice(0, 200),
    needsVenue: false,
  };
}

/** Deterministic `new_activity` idea for a category and slot. */
export function newActivitySuggestion(category: EventCategory, slot: AvailabilitySlot, prework: Prework): PlanSuggestion {
  const idea = IDEAS[category];
  const count = categoryCount(prework, category);
  const cost = prework.budgetMaxCents === null ? idea.costCents : Math.min(idea.costCents, prework.budgetMaxCents);
  const why = count > 0 ? `${share(count, prework.memberCount)} like ${CATEGORY_PHRASES[category]}, and` : 'Everyone';
  return {
    kind: 'new_activity',
    eventId: null,
    title: idea.title,
    description: idea.description,
    category,
    slot,
    estimatedCostCents: cost,
    whyItFits: `${why} ${count > 0 ? 'everyone is' : 'is'} free ${SLOT_PHRASES[slot]}.`.slice(0, 200),
    needsVenue: true,
  };
}

function bestCandidate(candidates: readonly CandidateEvent[], prework: Prework): CandidateEvent | null {
  const rank = (c: CandidateEvent) => {
    const index = prework.categories.findIndex((x) => x.category === c.category);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const sorted = [...candidates].sort((a, b) => rank(a) - rank(b) || a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
  return sorted[0] ?? null;
}

function fillerIdeas(prework: Prework, existing: readonly PlanSuggestion[]): PlanSuggestion[] {
  if (prework.sharedSlots.length === 0) return [];
  const used = new Set(existing.map((s) => s.category));
  const titles = new Set(existing.map((s) => s.title.toLowerCase()));
  const order = [...prework.categories.map((c) => c.category), ...EVENT_CATEGORY];
  const categories = [...new Set(order)].filter((c) => !used.has(c) && !titles.has(IDEAS[c].title.toLowerCase()));
  return categories.map((category, i) => newActivitySuggestion(category, prework.sharedSlots[i % prework.sharedSlots.length]!, prework));
}

/**
 * Make sure a plan has 2–4 suggestions: keep the validated model output, lead with the best
 * candidate event when the model picked none, and top up with ideas from the group's aggregates.
 */
export function completeSuggestions(
  valid: readonly PlanSuggestion[],
  prework: Prework,
  candidates: readonly CandidateEvent[],
): PlanSuggestion[] {
  let result = valid.slice(0, MAX_SUGGESTIONS);
  const best = bestCandidate(candidates, prework);
  if (best && !result.some((s) => s.kind === 'existing_event')) {
    result = [existingEventSuggestion(best, prework), ...result].slice(0, MAX_SUGGESTIONS);
  }
  const fillers = fillerIdeas(prework, result);
  while (result.length < MIN_SUGGESTIONS && fillers.length > 0) result = [...result, fillers.shift()!];
  return result;
}
