import { vi } from 'vitest';
import type { BusinessMatch, VenueCriteria } from '@/shared/types';
import type { DemandUser } from '@/features/demand/server/categories';
import { DEMAND_CONFIG } from '@/features/demand/server/config';
import type { PipelineDeps } from '@/features/demand/server/deps';
import { haversineKm } from '@/features/demand/server/geo';
import type { Venue } from '@/features/demand/server/venue';
import scene3 from '../../fixtures/demand/users-scene3.json';

export const NOW = new Date('2026-10-26T17:00:00Z'); // Monday 10:00 in San Francisco

export const scene3Users = (): DemandUser[] =>
  (scene3 as Array<{ allowDemandAggregation: boolean; preferences: DemandUser }>).map((r) => r.preferences);

export const consentingUsers = (): DemandUser[] =>
  (scene3 as Array<{ allowDemandAggregation: boolean; preferences: DemandUser }>).filter((r) => r.allowDemandAggregation).map((r) => r.preferences);

export const OPTED_OUT_ID = (scene3 as Array<{ allowDemandAggregation: boolean; preferences: DemandUser }>).find((r) => !r.allowDemandAggregation)?.preferences.userId as string;

function venue(id: string, name: string, lat: number, lng: number, caps: Venue['capabilities']): Venue & { lat: number; lng: number } {
  return {
    lat, lng,
    match: { businessId: id, name, score: 0, reasons: [] },
    card: { id, name, category: caps.eventCategories[0] as Venue['card']['category'], neighborhood: '', address: '', description: '', imageUrl: null },
    ownerId: `owner-${id}`,
    capabilities: caps,
  };
}

export const VENUES = [
  venue('b-kiln', 'Kiln & Cup', 37.75, -122.42, { eventCategories: ['creative', 'food_drink'], capacity: 12, hostingSlots: ['thu_eve', 'sat_day'], minPriceCents: 1500, maxPriceCents: 3500, equipmentTags: ['pottery-wheels', 'kiln'], formats: ['workshop'] }),
  venue('b-ritual', 'Ritual Grounds', 37.78, -122.42, { eventCategories: ['food_drink', 'community'], capacity: 20, hostingSlots: ['mon_eve', 'tue_eve', 'wed_eve', 'thu_eve', 'fri_eve', 'sat_eve', 'sun_eve'], minPriceCents: 0, maxPriceCents: 1500, equipmentTags: [], formats: ['tasting'] }),
  venue('b-meeple', 'Meeple House', 37.78, -122.40, { eventCategories: ['games', 'community'], capacity: 30, hostingSlots: ['fri_eve', 'sat_eve', 'sun_day'], minPriceCents: 500, maxPriceCents: 1500, equipmentTags: ['board-game-library'], formats: ['tournament'] }),
];

/** Mirrors 05's `findCandidateBusinesses` prefilter: category, capacity, distance. */
export function fakeFindCandidates(criteria: VenueCriteria): BusinessMatch[] {
  return VENUES.filter((v) => v.capabilities.eventCategories.includes(criteria.category))
    .filter((v) => v.capabilities.capacity >= criteria.cohortSize)
    .filter((v) => haversineKm({ lat: criteria.centerLat, lng: criteria.centerLng }, v) <= criteria.radiusKm)
    .map((v) => ({ ...v.match, score: v.capabilities.hostingSlots.includes(criteria.slot) ? 1 : 0.5 }))
    .sort((a, b) => b.score - a.score);
}

export function makeDeps(overrides: Partial<PipelineDeps> = {}) {
  const saved: Parameters<PipelineDeps['saveProposal']>[0][] = [];
  const pending = new Map<string, Date>();
  const deps: PipelineDeps = {
    config: DEMAND_CONFIG,
    now: () => NOW,
    withLock: (fn) => fn(),
    listEligibleUserIds: async () => scene3Users().map((u) => u.userId),
    getSharableBatch: async (ids) => new Map(consentingUsers().filter((u) => ids.includes(u.userId)).map((u) => [u.userId, u])),
    logActions: vi.fn(async () => undefined),
    findCandidates: async (c) => fakeFindCandidates(c),
    loadVenue: async (m) => VENUES.find((v) => v.match.businessId === m.businessId) ?? null,
    hasRecentPendingProposal: async (sig, since) => (pending.get(sig)?.getTime() ?? 0) >= since.getTime(),
    generate: async (input) => (await import('@/features/demand/server/generate')).templateProposal(input),
    createRun: async () => 'run-1',
    updateRun: vi.fn(async () => undefined),
    saveProposal: async (input) => {
      saved.push(input);
      pending.set(input.cluster.signature, NOW);
      return `p-${saved.length}`;
    },
    notify: vi.fn(async () => undefined),
    ...overrides,
  };
  return { deps, saved };
}
