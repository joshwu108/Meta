import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prework } from '@/features/groups/server/planner/prework';
import type { BusinessPublicCard, EventPublic, EventSummary } from '@/shared/types';

vi.mock('server-only', () => ({}));
const details = new Map<string, EventPublic>();
const upcoming = vi.fn<(userId: string) => Promise<EventSummary[]>>();
const eventPublic = vi.fn(async (id: string) => details.get(id) ?? null);
vi.mock('@/features/groups/server/stubs', () => ({
  getUpcomingEventsForUser: (userId: string) => upcoming(userId),
  getEventPublic: (id: string) => eventPublic(id),
}));

const { loadCandidateEvents } = await import('@/features/groups/server/planner/candidates');

const THU_EVE = '2026-10-30T02:00:00Z'; // Thursday 19:00 in Los Angeles (the planner's time zone)
const SAT_DAY = '2026-10-31T18:00:00Z'; // Saturday 11:00 in Los Angeles
const business: BusinessPublicCard = { id: 'b1', name: 'Kiln & Cup', category: 'creative', neighborhood: 'Mission', address: '1 Clay St', description: 'Studio', imageUrl: null };

function summary(id: string, overrides: Partial<EventSummary> = {}): EventSummary {
  return { id, title: `Event ${id}`, startsAt: THU_EVE, status: 'published', business, rsvpStatus: null, ...overrides };
}

function prework(overrides: Partial<Prework> = {}): Prework {
  return {
    memberCount: 4,
    sharedSlots: ['thu_eve'],
    budgetMaxCents: 2500,
    interests: [],
    categories: [{ category: 'creative', count: 3 }],
    activityPrefs: [],
    groupSizePref: 'small',
    neighborhood: 'Mission District',
    center: null,
    ...overrides,
  };
}

/** The requester's upcoming events, each with 06's public detail (creative, $15 unless overridden). */
function seed(...events: Array<[EventSummary, Partial<EventPublic>?]>): void {
  upcoming.mockResolvedValue(events.map(([event]) => event));
  for (const [event, overrides] of events) {
    details.set(event.id, { ...event, description: 'd', category: 'creative', endsAt: event.startsAt, capacity: 20, confirmedCount: 0, priceCents: 1500, format: 'workshop', source: 'business_manual', ...overrides });
  }
}

beforeEach(() => {
  upcoming.mockReset();
  eventPublic.mockClear();
  details.clear();
});

describe('loadCandidateEvents (planner step 4)', () => {
  it('skips the lookup entirely when the members share no slot', async () => {
    expect(await loadCandidateEvents('requester', prework({ sharedSlots: [] }))).toEqual([]);
    expect(upcoming).not.toHaveBeenCalled();
  });

  it('keeps only published events in a shared slot, in a member category and within budget', async () => {
    seed(
      [summary('ok')],
      [summary('full', { status: 'full' })],
      [summary('saturday', { startsAt: SAT_DAY })],
      [summary('games'), { category: 'games' }],
      [summary('pricey'), { priceCents: 4000 }],
    );
    expect(await loadCandidateEvents('requester', prework())).toEqual([
      { id: 'ok', title: 'Event ok', category: 'creative', slot: 'thu_eve', startsAt: THU_EVE, venue: 'Kiln & Cup', priceCents: 1500 },
    ]);
  });

  it('drops events whose details are gone and skips the category and budget filters when there are none', async () => {
    seed([summary('free'), { category: 'games', priceCents: null }], [summary('gone')]);
    details.delete('gone');
    const result = await loadCandidateEvents('requester', prework({ categories: [], budgetMaxCents: null }));
    expect(result.map((c) => c.id)).toEqual(['free']);
  });

  it('looks up at most 20 events and returns at most 8 candidates', async () => {
    seed(...Array.from({ length: 30 }, (_, i): [EventSummary] => [summary(`e${i}`)]));
    expect(await loadCandidateEvents('requester', prework())).toHaveLength(8);
    expect(eventPublic).toHaveBeenCalledTimes(20);
  });
});
