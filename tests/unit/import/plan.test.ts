import { describe, expect, it } from 'vitest';
import { fallbackPlan, planPromptInput, rankCandidates, validatePlan, type Candidates, type Taste } from '@/features/import/server/plan-core';
import planFixture from '@/lib/ai/fixtures/import.plan.json';
import { PlanOutputSchema } from '@/features/import/schemas';

const candidates: Candidates = {
  people: [
    { id: 'u-hiker', sharedInterests: ['hiking'], neighborhood: 'Castro' },
    { id: 'u-potter', sharedInterests: ['ceramics', 'coffee'], neighborhood: 'Mission' },
  ],
  events: [
    { id: 'e-horror', title: 'Horror movies double feature', category: 'learning', slot: 'fri_eve', neighborhood: 'SoMa', priceCents: 1200 },
    { id: 'e-trivia', title: 'Trivia night', category: 'games', slot: 'wed_eve', neighborhood: 'Mission', priceCents: 0 },
    { id: 'e-wheel', title: 'Wheel Throwing Basics', category: 'creative', slot: 'thu_eve', neighborhood: 'Mission', priceCents: 3500 },
  ],
  places: [
    { id: 'b-meeple', name: 'Meeple House', category: 'games', neighborhood: 'SoMa', distanceKm: 2 },
    { id: 'b-kiln', name: 'Kiln & Cup', category: 'creative', neighborhood: 'Mission', distanceKm: 0.5 },
  ],
  groups: [{ id: 'g-1', name: 'Mission Makers', interests: ['pottery'], memberCount: 4 }],
};
const taste: Taste = {
  interests: ['ceramics', 'board-games', 'pottery'],
  loved: new Set(['ceramics']),
  dislikes: [{ label: 'horror-movies', tag: null }, { label: 'hiking', tag: 'hiking' }],
};

describe('plan ranking', () => {
  const ranked = rankCandidates(candidates, taste);

  it('drops candidates that hit a dislike', () => {
    expect(ranked.people.map((p) => p.id)).toEqual(['u-potter']);
    expect(ranked.events.map((e) => e.id)).not.toContain('e-horror');
  });

  it('puts loved interests first', () => {
    expect(ranked.events[0]!.id).toBe('e-wheel');
    expect(ranked.places[0]!.id).toBe('b-kiln');
  });
});

describe('plan prompt input', () => {
  it('references candidates by ref only: no names, ids or titles', () => {
    const input = JSON.stringify(planPromptInput(rankCandidates(candidates, taste), taste));
    for (const secret of ['u-potter', 'e-wheel', 'b-kiln', 'g-1', 'Kiln & Cup', 'Meeple House', 'Wheel Throwing', 'Mission Makers']) {
      expect(input).not.toContain(secret);
    }
    expect(input).toContain('"person:0"');
    expect(input).toContain('"loved":["ceramics"]');
  });
});

describe('plan validator', () => {
  const ranked = rankCandidates(candidates, taste);

  it('resolves the fixture refs into deep links', () => {
    const cards = validatePlan(PlanOutputSchema.parse(planFixture), ranked);
    expect(cards).toHaveLength(3);
    expect(cards[0]!.steps[0]).toMatchObject({ action: 'rsvp', targetId: 'e-wheel', href: '/events/e-wheel' });
    expect(cards[1]!.steps[0]).toMatchObject({ action: 'connect', targetId: 'u-potter', href: '/match?focus=u-potter' });
    expect(cards[2]!.steps[0]).toMatchObject({ action: 'open_place', targetId: 'b-kiln', href: '/places' });
  });

  it('drops unknown refs, actions that do not fit, and cards left empty', () => {
    const cards = validatePlan(
      {
        cards: [
          { title: 'Bad', why: 'x', steps: [{ ref: 'person:9', action: 'connect', label: 'x' }, { ref: 'event:0', action: 'connect', label: 'x' }] },
          { title: 'Mixed', why: 'y', steps: [{ ref: 'place:0', action: 'rsvp', label: 'x' }, { ref: 'group:0', action: 'invite_group', label: 'Invite' }] },
        ],
      },
      ranked,
    );
    expect(cards).toEqual([
      { title: 'Mixed', why: 'y', steps: [{ ref: 'group:0', action: 'invite_group', label: 'Invite', targetId: 'g-1', href: '/groups/g-1' }] },
    ]);
  });

  it('falls back to top person + top event + top place without AI', () => {
    const cards = fallbackPlan(ranked);
    expect(cards.map((c) => c.steps[0]!.targetId)).toEqual(['u-potter', 'e-wheel', 'b-kiln']);
    expect(fallbackPlan({ people: [], events: [], places: [], groups: [] })).toEqual([]);
  });
});
