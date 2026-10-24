import type { CandidateEvent } from './fallback';
import type { Prework } from './prework';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MIN_FIRST_NAME = 3;

/**
 * Remove members' names from free text before it reaches the model. Full names and first names
 * (3+ letters) are replaced; last names alone are kept because they are often ordinary words.
 */
export function scrubNames(text: string, names: readonly string[]): string {
  const terms = names.flatMap((name) => {
    const full = name.trim().replace(/\s+/g, ' ');
    const first = full.split(' ')[0] ?? '';
    return [full, first.length >= MIN_FIRST_NAME ? first : ''];
  });
  const unique = [...new Set(terms.filter((t) => t.length >= MIN_FIRST_NAME))].sort((a, b) => b.length - a.length);
  return unique.reduce(
    (acc, term) => acc.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'giu'), 'a member'),
    text,
  );
}

/**
 * The only data the planner model sees (spec §5 step 5): the scrubbed request, aggregated
 * preferences of consenting members and candidate events. No names, ids or individual rows.
 */
export function buildPlannerInput(request: string, prework: Prework, candidates: readonly CandidateEvent[]) {
  return {
    request,
    group: {
      size: prework.memberCount,
      sharedSlots: prework.sharedSlots,
      budgetMaxCents: prework.budgetMaxCents,
      neighborhood: prework.neighborhood,
      groupSizePreference: prework.groupSizePref,
    },
    interests: prework.interests.slice(0, 10),
    categories: prework.categories,
    activityPrefs: prework.activityPrefs.slice(0, 6),
    candidateEvents: candidates.map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      slot: e.slot,
      startsAt: e.startsAt,
      venue: e.venue,
      priceCents: e.priceCents,
    })),
  };
}

export type PlannerInput = ReturnType<typeof buildPlannerInput>;
