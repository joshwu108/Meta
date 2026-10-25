import { normalizeTag, resolveCategories } from '@/features/matching';
import type { PlanAction, PlanOutput } from '../schemas';

/**
 * Pure plan stages (Phase 2). Candidates come from other workstreams' public exports; the model
 * only ever sees them as "person:0", "event:2"… with non-identifying public fields.
 */

export type PersonCandidate = { id: string; sharedInterests: string[]; neighborhood: string | null };
export type EventCandidate = { id: string; title: string; category: string; slot: string | null; neighborhood: string | null; priceCents: number | null };
export type PlaceCandidate = { id: string; name: string; category: string; neighborhood: string | null; distanceKm: number | null };
export type GroupCandidate = { id: string; name: string; interests: string[]; memberCount: number };

export type Candidates = { people: PersonCandidate[]; events: EventCandidate[]; places: PlaceCandidate[]; groups: GroupCandidate[] };
export type Taste = { interests: string[]; loved: ReadonlySet<string>; dislikes: ReadonlyArray<{ label: string; tag: string | null }> };

export type PlanStep = { ref: string; action: PlanAction; label: string; targetId: string | null; href: string };
export type PlanCard = { title: string; why: string; steps: PlanStep[] };

type Kind = 'person' | 'event' | 'place' | 'group';
const FITS: Record<Kind, readonly PlanAction[]> = {
  person: ['connect'],
  event: ['rsvp'],
  place: ['open_place', 'create_group'],
  group: ['invite_group'],
};

const words = (text: string) => normalizeTag(text).split('-').filter(Boolean);

function dislikeHit(tags: readonly string[], category: string | null, text: string, taste: Taste): boolean {
  const keys = new Set(taste.dislikes.flatMap((d) => [normalizeTag(d.label), ...(d.tag ? [d.tag] : [])]));
  const textKebab = `-${normalizeTag(text)}-`;
  return (
    tags.some((t) => keys.has(normalizeTag(t))) ||
    (category !== null && keys.has(normalizeTag(category.replace(/_/g, '-')))) ||
    [...keys].some((k) => k.length > 2 && textKebab.includes(`-${k}-`))
  );
}

/** Score: loved tags count double, other confirmed interests once (by tag or by category). */
function affinity(tags: readonly string[], category: string | null, text: string, taste: Taste): number {
  const all = new Set([...tags.map(normalizeTag), ...words(text)]);
  const lovedCats = new Set(resolveCategories([...taste.loved]));
  const likedCats = new Set(resolveCategories(taste.interests));
  let score = 0;
  for (const tag of taste.interests) if (all.has(tag)) score += taste.loved.has(tag) ? 2 : 1;
  if (category && lovedCats.has(category as never)) score += 2;
  else if (category && likedCats.has(category as never)) score += 1;
  return score;
}

const byScore = <T>(items: T[], score: (item: T) => number) =>
  items.map((item, i) => ({ item, s: score(item), i })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.item);

/** Drop disliked candidates and rank the rest, loved interests first. */
export function rankCandidates(c: Candidates, taste: Taste): Candidates {
  return {
    people: byScore(c.people.filter((p) => !dislikeHit(p.sharedInterests, null, '', taste)), (p) => affinity(p.sharedInterests, null, '', taste)),
    events: byScore(c.events.filter((e) => !dislikeHit([], e.category, e.title, taste)), (e) => affinity([], e.category, e.title, taste)),
    places: byScore(c.places.filter((p) => !dislikeHit([], p.category, p.name, taste)), (p) => affinity([], p.category, p.name, taste)),
    groups: byScore(c.groups.filter((g) => !dislikeHit(g.interests, null, g.name, taste)), (g) => affinity(g.interests, null, g.name, taste)),
  };
}

/** What the plan prompt receives: refs and public, non-identifying fields only (no names, no ids). */
export function planPromptInput(c: Candidates, taste: Taste) {
  return {
    interests: { loved: taste.interests.filter((t) => taste.loved.has(t)), others: taste.interests.filter((t) => !taste.loved.has(t)) },
    dislikes: taste.dislikes.map((d) => d.tag ?? d.label),
    candidates: {
      people: c.people.map((p, i) => ({ ref: `person:${i}`, sharedInterests: p.sharedInterests, neighborhood: p.neighborhood })),
      events: c.events.map((e, i) => ({ ref: `event:${i}`, category: e.category, slot: e.slot, neighborhood: e.neighborhood, priceCents: e.priceCents })),
      places: c.places.map((p, i) => ({ ref: `place:${i}`, category: p.category, neighborhood: p.neighborhood, distanceKm: p.distanceKm })),
      groups: c.groups.map((g, i) => ({ ref: `group:${i}`, interests: g.interests, members: g.memberCount })),
    },
  };
}

function target(c: Candidates, ref: string): { kind: Kind; id: string } | null {
  const [kind, index] = ref.split(':') as [Kind, string];
  const list = { person: c.people, event: c.events, place: c.places, group: c.groups }[kind];
  const item = list?.[Number(index)];
  return item ? { kind, id: item.id } : null;
}

function hrefFor(kind: Kind, action: PlanAction, id: string): string {
  if (kind === 'person') return `/match?focus=${encodeURIComponent(id)}`;
  if (kind === 'event') return `/events/${encodeURIComponent(id)}`;
  if (kind === 'group') return `/groups/${encodeURIComponent(id)}`;
  return action === 'create_group' ? '/groups' : '/places';
}

/** Keep steps whose ref exists and whose action fits the ref's kind; drop empty cards. */
export function validatePlan(output: PlanOutput, c: Candidates): PlanCard[] {
  return output.cards
    .map((card) => ({
      title: card.title,
      why: card.why,
      steps: card.steps.flatMap((step) => {
        const hit = target(c, step.ref);
        if (!hit || !FITS[hit.kind].includes(step.action)) return [];
        return [{ ref: step.ref, action: step.action, label: step.label, targetId: hit.id, href: hrefFor(hit.kind, step.action, hit.id) }];
      }),
    }))
    .filter((card) => card.steps.length > 0)
    .slice(0, 3);
}

/** Without AI: the top person, the top event and the top place, each as its own card. */
export function fallbackPlan(c: Candidates): PlanCard[] {
  const cards: PlanCard[] = [];
  const person = c.people[0];
  if (person) {
    const shared = person.sharedInterests.slice(0, 2).join(' and ');
    cards.push({
      title: 'Meet someone with your taste',
      why: shared ? `You both like ${shared.replace(/-/g, ' ')}.` : 'A good match near you.',
      steps: [{ ref: 'person:0', action: 'connect', label: 'Say hello', targetId: person.id, href: hrefFor('person', 'connect', person.id) }],
    });
  }
  const event = c.events[0];
  if (event) {
    cards.push({
      title: 'Try something this week',
      why: `A ${event.category.replace(/_/g, ' ')} event that fits what you said yes to.`,
      steps: [{ ref: 'event:0', action: 'rsvp', label: 'See the event', targetId: event.id, href: hrefFor('event', 'rsvp', event.id) }],
    });
  }
  const place = c.places[0];
  if (place) {
    cards.push({
      title: 'Drop by a place nearby',
      why: `A ${place.category.replace(/_/g, ' ')} spot${place.neighborhood ? ` in ${place.neighborhood}` : ''}.`,
      steps: [{ ref: 'place:0', action: 'open_place', label: 'See places', targetId: place.id, href: hrefFor('place', 'open_place', place.id) }],
    });
  }
  return cards;
}
