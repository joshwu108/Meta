import type { AggregatedCluster } from '@/features/demand/server/aggregate';
import type { DemandBrief } from '@/features/demand/schemas';
import type { Venue } from '@/features/demand/server/venue';
import briefs from './briefs.json';

/** Spec §9 prompt eval: 5 briefs; ≥ 4/5 must pass the validator on the first try with a live key. */
export type EvalCase = { name: string; brief: DemandBrief; venue: Venue; cluster: AggregatedCluster };

const BAND_COUNT: Record<DemandBrief['demandBand'], number> = { '4-5': 5, '6-9': 7, '10+': 12, '20+': 22 };

const VENUES: Record<string, Venue> = {
  kiln: venue('kiln', 'Kiln & Cup', 'creative', { eventCategories: ['creative', 'food_drink'], capacity: 12, hostingSlots: ['thu_eve', 'sat_day'], minPriceCents: 1500, maxPriceCents: 3500, equipmentTags: ['pottery-wheels', 'kiln'], formats: ['workshop'] }),
  ritual: venue('ritual', 'Ritual Grounds', 'food_drink', { eventCategories: ['food_drink', 'community'], capacity: 20, hostingSlots: ['mon_eve', 'tue_eve', 'wed_eve', 'thu_eve', 'fri_eve', 'sat_eve', 'sun_eve'], minPriceCents: 0, maxPriceCents: 1500, equipmentTags: ['espresso-bar'], formats: ['tasting'] }),
  meeple: venue('meeple', 'Meeple House', 'games', { eventCategories: ['games', 'community'], capacity: 30, hostingSlots: ['fri_eve', 'sat_eve', 'sun_day'], minPriceCents: 500, maxPriceCents: 1500, equipmentTags: ['board-game-library'], formats: ['tournament'] }),
};

function venue(id: string, name: string, category: Venue['card']['category'], capabilities: Venue['capabilities']): Venue {
  return {
    match: { businessId: id, name, score: 1, reasons: [] },
    ownerId: `owner-${id}`,
    card: { id, name, category, neighborhood: '', address: '', description: `${name}, a local venue.`, imageUrl: null },
    capabilities,
  };
}

/** A cluster consistent with the brief, for running the code validator over the model's draft. */
function clusterFor(brief: DemandBrief): AggregatedCluster {
  const memberCount = BAND_COUNT[brief.demandBand];
  return {
    category: brief.category, slot: brief.slot, geocell: '0.00,0.00', center: { lat: 0, lng: 0 }, members: [],
    signature: `${brief.category}|${brief.slot}|eval`, memberCount, band: brief.demandBand, topInterests: brief.topInterests,
    groupSizeMode: brief.groupSizeMode, budgetP50Cents: brief.budgetP50Cents, activityPrefs: brief.activityPrefs,
    neighborhoodLabel: brief.neighborhoodLabel, rankScore: 0,
  };
}

export const EVAL_CASES: EvalCase[] = (briefs as Array<{ name: string; venue: string; brief: DemandBrief }>).map((c) => ({
  name: c.name,
  brief: c.brief,
  venue: VENUES[c.venue] as Venue,
  cluster: clusterFor(c.brief),
}));
