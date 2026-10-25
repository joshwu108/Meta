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

/**
 * One of the requester's upcoming events with 06's public detail (creative, $15 unless overridden).
 * Built as a full `EventPublic`, which is also a valid `EventSummary` whether `category` sits on
 * the summary (01's pending change) or only on the detail.
 */
function event(id: string, overrides: Partial<EventPublic> = {}): EventPublic {
  return {
    id,
    title: `Event ${id}`,
    startsAt: THU_EVE,
    status: 'published',
    business,
    rsvpStatus: null,
    description: 'd',
    category: 'creative',
    endsAt: THU_EVE,
    capacity: 20,
    confirmedCount: 0,
    priceCents: 1500,
    format: 'workshop',
    source: 'business_manual',
    ...overrides,
  };
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

function seed(...events: EventPublic[]): void {
  upcoming.mockResolvedValue(events);
  for (const e of events) details.set(e.id, e);
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
      event('ok'),
      event('full', { status: 'full' }),
      event('saturday', { startsAt: SAT_DAY }),
      event('games', { category: 'games' }),
      event('pricey', { priceCents: 4000 }),
    );
    expect(await loadCandidateEvents('requester', prework())).toEqual([
      { id: 'ok', title: 'Event ok', category: 'creative', slot: 'thu_eve', startsAt: THU_EVE, venue: 'Kiln & Cup', priceCents: 1500 },
    ]);
  });

  it('drops events whose details are gone and skips the category and budget filters when there are none', async () => {
    seed(event('free', { category: 'games', priceCents: null }), event('gone'));
    details.delete('gone');
    const result = await loadCandidateEvents('requester', prework({ categories: [], budgetMaxCents: null }));
    expect(result.map((c) => c.id)).toEqual(['free']);
  });

  it('looks up at most 20 events and returns at most 8 candidates', async () => {
    seed(...Array.from({ length: 30 }, (_, i) => event(`e${i}`)));
    expect(await loadCandidateEvents('requester', prework())).toHaveLength(8);
    expect(eventPublic).toHaveBeenCalledTimes(20);
  });
});
