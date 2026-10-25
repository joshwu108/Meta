import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { pickVenue } = await import('@/features/demand/server/process-cluster');
const { DEMAND_CONFIG } = await import('@/features/demand/server/config');

type Match = { businessId: string; name: string; score: number; reasons: string[] };

const cluster = {
  category: 'games' as const,
  memberCount: 20,
  slot: 'fri_eve' as const,
  center: { lat: 37.77, lng: -122.4 },
  budgetP50Cents: 2500,
};

/** A candidate list in rank order, and venues whose only interesting property is capacity. */
function deps(venues: readonly { id: string; capacity: number }[]) {
  const matches: Match[] = venues.map((v, i) => ({ businessId: v.id, name: v.id, score: 1 - i * 0.1, reasons: [] }));
  const byId = new Map(venues.map((v) => [v.id, v]));
  return {
    config: DEMAND_CONFIG,
    findCandidates: vi.fn().mockResolvedValue(matches),
    loadVenue: vi.fn(async (match: Match) => {
      const v = byId.get(match.businessId);
      return v
        ? {
            match,
            ownerId: `owner-${v.id}`,
            card: { id: v.id, name: v.id, category: 'games', neighborhood: '', address: '', description: '', imageUrl: null },
            capabilities: {
              eventCategories: ['games'], capacity: v.capacity, hostingSlots: ['fri_eve'],
              minPriceCents: null, maxPriceCents: null, equipmentTags: [], formats: [],
            },
          }
        : null;
    }),
  } as never;
}

describe('pickVenue capacity rule', () => {
  it('picks a venue smaller than the cohort rather than skipping it', async () => {
    // The regression: a 12-seat venue next to a 20-person cohort was skipped entirely, so small
    // venues never received proposals once local demand exceeded their size. Turnout is modelled
    // separately and capped at capacity, so a smaller venue is viable.
    const venue = await pickVenue(cluster, deps([{ id: 'small', capacity: 12 }]), new Map());
    expect(venue?.card.id).toBe('small');
  });

  it('honours candidate rank when several venues qualify', async () => {
    const venue = await pickVenue(
      cluster,
      deps([{ id: 'first', capacity: 12 }, { id: 'second', capacity: 30 }]),
      new Map(),
    );
    expect(venue?.card.id).toBe('first');
  });

  it('skips a venue below the minimum cohort size', async () => {
    const venue = await pickVenue(
      cluster,
      deps([{ id: 'tiny', capacity: DEMAND_CONFIG.minCohortSize - 1 }, { id: 'ok', capacity: 10 }]),
      new Map(),
    );
    expect(venue?.card.id).toBe('ok');
  });

  it('returns null when every candidate is below the floor', async () => {
    const venue = await pickVenue(cluster, deps([{ id: 'tiny', capacity: 1 }]), new Map());
    expect(venue).toBeNull();
  });

  it('still respects the per-business cap for this run', async () => {
    const used = new Map([['small', DEMAND_CONFIG.maxProposalsPerBusinessPerRun]]);
    const venue = await pickVenue(
      cluster,
      deps([{ id: 'small', capacity: 12 }, { id: 'other', capacity: 14 }]),
      used,
    );
    expect(venue?.card.id).toBe('other');
  });
});
