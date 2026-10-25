/**
 * Does the seeded population actually cluster? Reads the live local Postgres and runs the
 * production clustering code over it, with no Next or AI in the import graph.
 *   pnpm tsx tests/evals/demand/cluster-check.ts
 */
import { Client } from 'pg';
import { DEMAND_CONFIG } from '../../../src/features/demand/server/config';
import { clusterUsers, filterUsers } from '../../../src/features/demand/server/cluster';
import { haversineKm } from '../../../src/features/demand/server/geo';
import type { DemandUser } from '../../../src/features/demand/server/categories';

const DB = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function main(): Promise<number> {
  const client = new Client({ connectionString: DB });
  await client.connect();

  // Only users who consent to demand aggregation, exactly as the pipeline filters.
  const { rows } = await client.query(`
    select p.id, up.interests, up.interest_categories, up.availability_slots, up.social_goals,
           up.group_size_pref, up.budget_min_cents, up.budget_max_cents, up.travel_radius_km,
           up.activity_prefs, p.coarse_lat, p.coarse_lng, p.neighborhood
    from user_preferences up
    join profiles p on p.id = up.user_id
    join agent_profiles ap on ap.user_id = up.user_id
    where (ap.consent->>'allow_demand_aggregation')::boolean is true
  `);
  const venues = await client.query('select name, category, lat, lng from businesses');
  await client.end();

  const users: DemandUser[] = rows.map((r) => ({
    userId: r.id,
    interests: r.interests ?? [],
    interestCategories: r.interest_categories ?? [],
    availabilitySlots: r.availability_slots ?? [],
    socialGoals: r.social_goals ?? [],
    groupSizePref: r.group_size_pref,
    budgetMin: r.budget_min_cents,
    budgetMax: r.budget_max_cents,
    travelRadiusKm: Number(r.travel_radius_km ?? 5),
    activityPrefs: r.activity_prefs ?? [],
    coarseLat: r.coarse_lat === null ? null : Number(r.coarse_lat),
    coarseLng: r.coarse_lng === null ? null : Number(r.coarse_lng),
    neighborhood: r.neighborhood,
  })) as DemandUser[];

  const located = filterUsers(users);
  const clusters = clusterUsers(located, DEMAND_CONFIG);
  const qualifying = clusters
    .filter((c) => c.members.length >= DEMAND_CONFIG.minCohortSize)
    .sort((a, b) => b.members.length - a.members.length);

  console.log(`consenting users read : ${users.length}`);
  console.log(`clusterable (located) : ${located.length}`);
  console.log(`clusters formed       : ${clusters.length}`);
  console.log(`>= minCohortSize (${DEMAND_CONFIG.minCohortSize})  : ${qualifying.length}\n`);

  console.log('top qualifying clusters:');
  for (const c of qualifying.slice(0, 12)) {
    const near = venues.rows
      .map((v) => ({ name: v.name, km: haversineKm(c.center, { lat: Number(v.lat), lng: Number(v.lng) }) }))
      .filter((v) => v.km <= DEMAND_CONFIG.venueRadiusKm)
      .sort((a, b) => a.km - b.km);
    const venueNote = near.length ? `venues in ${DEMAND_CONFIG.venueRadiusKm}km: ${near.map((v) => `${v.name} (${v.km.toFixed(1)}km)`).join(', ')}` : 'no venue in radius';
    console.log(`  ${String(c.members.length).padStart(3)} members  ${c.category.padEnd(11)} ${c.slot.padEnd(8)}  ${venueNote}`);
  }

  const proposable = qualifying.filter((c) =>
    venues.rows.some(
      (v) =>
        v.category === c.category &&
        haversineKm(c.center, { lat: Number(v.lat), lng: Number(v.lng) }) <= DEMAND_CONFIG.venueRadiusKm,
    ),
  );
  console.log(`\nclusters matched to a venue of the same category: ${proposable.length}`);
  if (proposable.length === 0) {
    console.error('FAIL: no cluster can produce a proposal');
    return 1;
  }
  console.log('PASS: the seed produces proposable demand');
  return 0;
}

main().then((code) => process.exit(code));
