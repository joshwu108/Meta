import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { generatePeople } = await import('../../../supabase/seed/generate/personas');
const { cohortPlans, plannedMemberCount } = await import('../../../supabase/seed/generate/cohorts');
const { clusterUsers, filterUsers } = await import('@/features/demand/server/cluster');
const { DEMAND_CONFIG } = await import('@/features/demand/server/config');
const { haversineKm } = await import('@/features/demand/server/geo');

type Person = ReturnType<typeof generatePeople>[number];

/** The generated persona in the shape the demand pipeline consumes. */
function toDemandUser(person: Person, index: number) {
  return {
    userId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    interests: person.interests,
    interestCategories: person.interestCategories,
    availabilitySlots: person.availabilitySlots,
    socialGoals: person.socialGoals,
    groupSizePref: person.groupSizePref,
    budgetMin: person.budgetMinCents,
    budgetMax: person.budgetMaxCents,
    travelRadiusKm: person.travelRadiusKm,
    activityPrefs: person.activityPrefs,
    coarseLat: person.coarseLat,
    coarseLng: person.coarseLng,
    neighborhood: person.neighborhood,
  };
}

/** Only people who consent to demand aggregation reach the pipeline. */
function clustersFrom(people: readonly Person[]) {
  const users = people
    .filter((p) => p.consent.allow_demand_aggregation)
    .map((p, i) => toDemandUser(p, i));
  return clusterUsers(filterUsers(users as never), DEMAND_CONFIG);
}

describe('generated personas', () => {
  it('is deterministic: the same seed produces identical people', () => {
    expect(generatePeople(120)).toEqual(generatePeople(120));
  });

  it('produces exactly the requested headcount with unique emails', () => {
    const people = generatePeople(300);
    expect(people).toHaveLength(300);
    expect(new Set(people.map((p) => p.email)).size).toBe(300);
  });

  it('namespaces every email under gen. so demo fixtures cannot collide', () => {
    // The e2e suites assert on the hand-written accounts; a collision would break them.
    expect(generatePeople(300).every((p) => p.email.startsWith('gen.'))).toBe(true);
  });

  it('realises every planted cohort before adding unaffiliated people', () => {
    const plans = cohortPlans();
    const people = generatePeople(300, plans);
    for (const plan of plans) {
      const members = people.filter((p) => p.cohortKey === plan.key);
      expect(members).toHaveLength(plan.size);
      // Every member must carry the cohort's category, slot and shared core tags, or the
      // cluster will not form and its top interests will not clear minInterestTagCount.
      for (const member of members) {
        expect(member.interestCategories).toContain(plan.category);
        expect(member.availabilitySlots).toContain(plan.slot);
        for (const tag of plan.coreTags) expect(member.interests).toContain(tag);
      }
    }
    expect(people.filter((p) => p.cohortKey === null)).toHaveLength(300 - plannedMemberCount(plans));
  });

  it('leaves a deliberate minority opted out of demand aggregation', () => {
    const people = generatePeople(300);
    const optedOut = people.filter((p) => !p.consent.allow_demand_aggregation);
    expect(optedOut.length).toBeGreaterThan(0);
    expect(optedOut.length).toBeLessThan(people.length * 0.25);
  });
});

describe('planted cohorts actually cluster', () => {
  it('yields at least one qualifying cluster per planted cohort', () => {
    const plans = cohortPlans();
    const qualifying = clustersFrom(generatePeople(300, plans)).filter(
      (c) => c.members.length >= DEMAND_CONFIG.minCohortSize,
    );
    // This is the assertion that the whole seeder exists for: before it, the pipeline saw zero.
    expect(qualifying.length).toBeGreaterThanOrEqual(plans.length);
  });

  it('puts a qualifying cluster of the right category within venue radius of each planted centre', () => {
    const plans = cohortPlans();
    const clusters = clustersFrom(generatePeople(300, plans));
    for (const plan of plans) {
      const reachable = clusters.filter(
        (c) =>
          c.category === plan.category &&
          c.slot === plan.slot &&
          c.members.length >= DEMAND_CONFIG.minCohortSize &&
          haversineKm(c.center, { lat: plan.lat, lng: plan.lng }) <= DEMAND_CONFIG.venueRadiusKm,
      );
      expect(reachable.length, `no proposable cluster for ${plan.key}`).toBeGreaterThan(0);
    }
  });

  it('covers every venue-critical combo only because of planting, not volume', () => {
    // Volume alone does yield clusters -- 300 people over 6 neighbourhoods cluster incidentally.
    // What it does not do is cover the specific (category, slot, place) combos a venue needs:
    // measured, planting covers 15/15 and unaffiliated people alone cover 4/15. This is the
    // difference between "there is demand data" and "every venue has a proposal waiting".
    const plans = cohortPlans();
    const people = generatePeople(300, plans);

    const covers = (clusters: ReturnType<typeof clustersFrom>, plan: (typeof plans)[number]) =>
      clusters.some(
        (c) =>
          c.category === plan.category &&
          c.slot === plan.slot &&
          c.members.length >= DEMAND_CONFIG.minCohortSize &&
          haversineKm(c.center, { lat: plan.lat, lng: plan.lng }) <= DEMAND_CONFIG.venueRadiusKm,
      );

    const planted = clustersFrom(people);
    const noiseOnly = clustersFrom(people.filter((p) => p.cohortKey === null));

    expect(plans.filter((plan) => covers(planted, plan))).toHaveLength(plans.length);
    expect(plans.filter((plan) => covers(noiseOnly, plan)).length).toBeLessThan(plans.length);
  });
});
