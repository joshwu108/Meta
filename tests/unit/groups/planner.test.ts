import { describe, expect, it, vi } from 'vitest';
import type { MatchingPreferences } from '@/features/matching';

vi.mock('server-only', () => ({}));
vi.mock('@/features/core', () => ({ logAgentAction: vi.fn(), notify: vi.fn() }));
import { slotForStart } from '@/features/groups/server/planner/slots';
import { budgetEnvelope, buildPrework, countValues, intersectSlots, modeOf } from '@/features/groups/server/planner/prework';
import { validateSuggestions } from '@/features/groups/server/planner/validate';
import { completeSuggestions, type CandidateEvent } from '@/features/groups/server/planner/fallback';
import { buildPlannerInput, scrubNames } from '@/features/groups/server/planner/input';
import type { PlanSuggestion } from '@/shared/schemas/social';

function member(userId: string, overrides: Partial<MatchingPreferences> = {}): MatchingPreferences {
  return {
    userId,
    interests: ['pottery', 'coffee'],
    interestCategories: ['creative', 'food_drink'],
    availabilitySlots: ['thu_eve', 'sat_day'],
    socialGoals: ['make_friends'],
    groupSizePref: 'small',
    budgetMin: null,
    budgetMax: 3000,
    travelRadiusKm: 5,
    activityPrefs: ['beginner-friendly'],
    coarseLat: 37.76,
    coarseLng: -122.42,
    neighborhood: 'Mission District',
    ...overrides,
  };
}

const members = [
  member('a'),
  member('b', { interests: ['pottery', 'painting'], availabilitySlots: ['thu_eve', 'fri_eve'], budgetMax: 2000, coarseLat: 37.78 }),
  member('c', { interests: ['ceramics', 'coffee'], availabilitySlots: ['thu_eve', 'sat_day', 'sun_day'], budgetMax: null, neighborhood: 'Castro', coarseLng: -122.44 }),
];

const suggestion = (overrides: Partial<PlanSuggestion> = {}): PlanSuggestion => ({
  kind: 'new_activity',
  eventId: null,
  title: 'Pottery night',
  description: 'Throw some bowls together.',
  category: 'creative',
  slot: 'thu_eve',
  estimatedCostCents: 2000,
  whyItFits: 'Everyone likes pottery and is free Thursday.',
  needsVenue: true,
  ...overrides,
});

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const candidate: CandidateEvent = {
  id: EVENT_ID,
  title: 'Wheel Throwing Basics',
  category: 'creative',
  slot: 'thu_eve',
  startsAt: '2026-10-29T01:00:00.000Z',
  venue: 'Kiln & Cup',
  priceCents: 3500,
};

describe('slotForStart (America/Los_Angeles)', () => {
  it('maps evenings, weekend days and late nights', () => {
    expect(slotForStart('2026-10-30T01:00:00Z')).toBe('thu_eve'); // Thu 18:00 PDT
    expect(slotForStart('2026-10-31T17:00:00Z')).toBe('sat_day'); // Sat 10:00 PDT
    expect(slotForStart('2026-11-01T02:00:00Z')).toBe('sat_eve'); // Sat 19:00 PDT
    expect(slotForStart('2026-10-30T08:30:00Z')).toBe('thu_eve'); // Fri 01:30 PDT → Thursday night
    expect(slotForStart('2026-10-28T19:00:00Z')).toBeNull(); // Wed 12:00 PDT
    expect(slotForStart('not a date')).toBeNull();
  });

  it('handles the DST change (PST after Nov 1)', () => {
    expect(slotForStart('2026-11-06T02:00:00Z')).toBe('thu_eve'); // Thu 18:00 PST
  });
});

describe('planner pre-work', () => {
  it('intersects availability across members in week order', () => {
    expect(intersectSlots(members)).toEqual(['thu_eve']);
    expect(intersectSlots([])).toEqual([]);
    expect(intersectSlots([member('x', { availabilitySlots: ['sun_day', 'mon_eve'] })])).toEqual(['mon_eve', 'sun_day']);
  });

  it('takes the smallest stated budget as the envelope', () => {
    expect(budgetEnvelope(members)).toBe(2000);
    expect(budgetEnvelope([member('x', { budgetMax: null })])).toBeNull();
  });

  it('counts values and picks modes deterministically', () => {
    expect(countValues([['a', 'b'], ['b'], ['b', 'c', 'c']])).toEqual([
      { value: 'b', count: 3 },
      { value: 'a', count: 1 },
      { value: 'c', count: 1 },
    ]);
    expect(modeOf(['x', 'y', 'y', null])).toBe('y');
    expect(modeOf([null])).toBeNull();
  });

  it('aggregates without any user ids', () => {
    const prework = buildPrework(members);
    expect(prework.memberCount).toBe(3);
    expect(prework.sharedSlots).toEqual(['thu_eve']);
    expect(prework.budgetMaxCents).toBe(2000);
    expect(prework.interests.slice(0, 2)).toEqual([
      { tag: 'coffee', count: 2 },
      { tag: 'pottery', count: 2 },
    ]);
    expect(prework.categories[0]).toEqual({ category: 'creative', count: 3 });
    expect(prework.neighborhood).toBe('Mission District');
    expect(prework.center).toEqual({ lat: 37.77, lng: -122.43 });
    expect(JSON.stringify(prework)).not.toMatch(/"(a|b|c)"/);
  });
});

describe('validateSuggestions', () => {
  const ctx = { sharedSlots: ['thu_eve'] as const, candidateEventIds: new Set([EVENT_ID]) };

  it('drops suggestions outside the shared slots or pointing at unknown events', () => {
    const kept = validateSuggestions(
      [
        suggestion(),
        suggestion({ title: 'Saturday hike', slot: 'sat_day' }),
        suggestion({ kind: 'existing_event', eventId: EVENT_ID, title: 'Wheel Throwing Basics', needsVenue: true }),
        suggestion({ kind: 'existing_event', eventId: '22222222-2222-4222-8222-222222222222', title: 'Ghost event' }),
        suggestion({ kind: 'existing_event', eventId: null, title: 'No id' }),
      ],
      ctx,
    );
    expect(kept.map((s) => s.title)).toEqual(['Pottery night', 'Wheel Throwing Basics']);
    expect(kept[1]).toMatchObject({ eventId: EVENT_ID, needsVenue: false });
  });

  it('clears event ids on new activities, removes duplicates and keeps at most four', () => {
    const kept = validateSuggestions(
      [
        suggestion({ eventId: EVENT_ID }),
        suggestion({ title: 'pottery NIGHT' }),
        ...['A', 'B', 'C', 'D'].map((t) => suggestion({ title: t })),
      ],
      ctx,
    );
    expect(kept[0]!.eventId).toBeNull();
    expect(kept.map((s) => s.title)).toEqual(['Pottery night', 'A', 'B', 'C']);
  });
});

describe('completeSuggestions', () => {
  const prework = buildPrework(members);

  it('tops up to two suggestions from the group data and surfaces a candidate event', () => {
    const done = completeSuggestions([], prework, [candidate]);
    expect(done.length).toBeGreaterThanOrEqual(2);
    expect(done[0]).toMatchObject({ kind: 'existing_event', eventId: EVENT_ID, slot: 'thu_eve' });
    expect(done.every((s) => s.slot === 'thu_eve')).toBe(true);
  });

  it('keeps valid model output and adds the best event when none was chosen', () => {
    const done = completeSuggestions([suggestion(), suggestion({ title: 'Coffee crawl', category: 'food_drink' })], prework, [candidate]);
    expect(done.map((s) => s.title)).toEqual(['Wheel Throwing Basics', 'Pottery night', 'Coffee crawl']);
  });

  it('never exceeds four suggestions', () => {
    const four = ['A', 'B', 'C', 'D'].map((t) => suggestion({ title: t }));
    const done = completeSuggestions(four, prework, [candidate]);
    expect(done).toHaveLength(4);
    expect(done[0]!.kind).toBe('existing_event');
  });

  it('works with no candidate events', () => {
    const done = completeSuggestions([], prework, []);
    expect(done).toHaveLength(2);
    expect(done.every((s) => s.kind === 'new_activity' && s.needsVenue)).toBe(true);
    expect(new Set(done.map((s) => s.title)).size).toBe(2);
  });
});

describe('planner input', () => {
  it('scrubs member names from the request text', () => {
    expect(scrubNames('Plan something for Maya Chen and leo please', ['Maya Chen', 'Leo Park'])).toBe('Plan something for a member and a member please');
    expect(scrubNames('Mayan food?', ['Maya Chen'])).toBe('Mayan food?');
    // Last names alone are common words ("park"), so only full names and first names are removed.
    expect(scrubNames('Picnic at the park with Park', ['Leo Park'])).toBe('Picnic at the park with Park');
    expect(scrubNames('Ask Jo', ['Jo Smith'])).toBe('Ask Jo');
  });

  it('contains only aggregated fields', () => {
    const input = buildPlannerInput('Something creative', buildPrework(members), [candidate]);
    expect(Object.keys(input).sort()).toEqual(['activityPrefs', 'candidateEvents', 'categories', 'group', 'interests', 'request']);
    expect(input.group).toEqual({ size: 3, sharedSlots: ['thu_eve'], budgetMaxCents: 2000, neighborhood: 'Mission District', groupSizePreference: 'small' });
    expect(JSON.stringify(input)).not.toMatch(/userId|"a"|"b"|"c"/);
  });
});

describe('scheduling conflicts (02 resolveGroupSchedule + chooseSlots)', () => {
  it('uses every shared slot when there are any', async () => {
    const { chooseSlots } = await import('@/features/groups/server/planner/schedule');
    const { resolveGroupSchedule } = await import('@/features/groups/server/stubs');
    const plan = chooseSlots(['thu_eve'], resolveGroupSchedule(members), 3);
    expect(plan).toEqual({ slots: ['thu_eve'], freeCounts: { thu_eve: 3 }, everyoneFree: true });
  });

  it('falls back to the slots at least half the members can make', async () => {
    const { chooseSlots } = await import('@/features/groups/server/planner/schedule');
    const { resolveGroupSchedule } = await import('@/features/groups/server/stubs');
    const split = [member('a', { availabilitySlots: ['thu_eve', 'sat_day'] }), member('b', { availabilitySlots: ['sat_day'] }), member('c', { availabilitySlots: ['thu_eve'] })];
    const schedule = resolveGroupSchedule(split);
    expect(schedule.unanimous).toBeNull();
    expect(chooseSlots([], schedule, 3)).toEqual({ slots: ['thu_eve', 'sat_day'], freeCounts: { thu_eve: 2, sat_day: 2 }, everyoneFree: false });
    const apart = [member('a', { availabilitySlots: ['mon_eve'] }), member('b', { availabilitySlots: ['sun_day'] })];
    expect(chooseSlots([], resolveGroupSchedule(apart), 2).slots).toEqual([]);
  });

  it('says who is free when not everyone is, and tells the model counts only', async () => {
    const prework = { ...buildPrework(members), sharedSlots: ['sat_day' as const], availability: { everyoneFree: false, freeCounts: { sat_day: 2 } } };
    const [idea] = completeSuggestions([], prework, []);
    expect(idea!.whyItFits).toContain('2 of 3 of you are free Saturday daytime');
    const input = buildPlannerInput('x', prework, []);
    expect(input.group).toMatchObject({ everyoneFree: false, freeCounts: [{ slot: 'sat_day', free: 2 }] });
    expect(JSON.stringify(input)).not.toMatch(/"(a|b|c)"/);
  });
});
