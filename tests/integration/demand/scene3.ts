import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, type TestUser } from '../helpers';
import scene3 from '../../fixtures/demand/users-scene3.json';

type Row = { email: string; allowDemandAggregation: boolean; preferences: Record<string, unknown> & { coarseLat: number; coarseLng: number; neighborhood: string } };

/** Local stack's database container (`project_id` in supabase/config.toml). */
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_commonground';

/** Applies the guarded 02/05 stand-in tables with psql in the local db container (no DDL over PostgREST). */
export function applyTestSchema(): void {
  const sql = readFileSync(path.join(process.cwd(), 'tests', 'integration', 'demand', 'test-schema.sql'), 'utf8');
  execSync(`docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q`, { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
}

/**
 * The synthetic Scene 3 world sits one degree north of the seeded demo data (02 seeds the same 14
 * users and 05 the same venues), so its cohorts and venue matches never mix with the seed.
 */
const TEST_LAT_OFFSET = 1;

const VENUES = [
  { slug: 'kiln', name: 'Kiln & Cup', category: 'creative', neighborhood: 'Mission District', lat: 37.75, lng: -122.42, caps: { event_categories: ['creative', 'food_drink'], capacity: 12, min_price_cents: 1500, max_price_cents: 3500, hosting_slots: ['thu_eve', 'sat_day'] } },
  { slug: 'ritual', name: 'Ritual Grounds', category: 'food_drink', neighborhood: 'Hayes Valley', lat: 37.78, lng: -122.42, caps: { event_categories: ['food_drink', 'community'], capacity: 20, min_price_cents: 0, max_price_cents: 1500, hosting_slots: ['mon_eve', 'tue_eve', 'wed_eve', 'thu_eve', 'fri_eve', 'sat_eve', 'sun_eve'] } },
  { slug: 'meeple', name: 'Meeple House', category: 'games', neighborhood: 'SoMa', lat: 37.78, lng: -122.4, caps: { event_categories: ['games', 'community'], capacity: 30, min_price_cents: 500, max_price_cents: 1500, hosting_slots: ['fri_eve', 'sat_eve', 'sun_day'] } },
] as const;

export type Scene3World = {
  consumers: Map<string, TestUser>;
  owners: Map<string, TestUser & { businessId: string }>;
  optedOutId: string;
};

async function seedConsumer(admin: SupabaseClient, row: Row): Promise<TestUser> {
  const user = await createTestUser(admin as never, row.email.split('@')[0] as string);
  const p = row.preferences;
  const must = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };
  must(await admin.from('profiles').update({
    neighborhood: p.neighborhood, coarse_lat: p.coarseLat + TEST_LAT_OFFSET, coarse_lng: p.coarseLng, is_discoverable: true, onboarding_completed_at: new Date().toISOString(),
  }).eq('id', user.id));
  must(await admin.from('user_preferences').upsert({
    user_id: user.id, interests: p['interests'], interest_categories: p['interestCategories'], availability_slots: p['availabilitySlots'],
    social_goals: p['socialGoals'], group_size_pref: p['groupSizePref'], budget_min_cents: p['budgetMin'], budget_max_cents: p['budgetMax'],
    travel_radius_km: p['travelRadiusKm'], activity_prefs: p['activityPrefs'],
  }));
  must(await admin.from('agent_profiles').upsert({ user_id: user.id, consent: { allow_demand_aggregation: row.allowDemandAggregation } }));
  return user;
}

async function seedVenue(admin: SupabaseClient, v: (typeof VENUES)[number]): Promise<TestUser & { businessId: string }> {
  const owner = await createTestUser(admin as never, `owner-${v.slug}`);
  const { data, error } = await admin.from('businesses').insert({
    owner_id: owner.id, name: v.name, slug: `${v.slug}-${owner.id.slice(0, 8)}`, category: v.category, address: '1 Test St', neighborhood: v.neighborhood, lat: v.lat + TEST_LAT_OFFSET, lng: v.lng,
  }).select('id').single();
  if (error) throw new Error(error.message);
  const businessId = (data as { id: string }).id;
  const caps = await admin.from('business_capabilities').insert({ business_id: businessId, ...v.caps });
  if (caps.error) throw new Error(caps.error.message);
  return { ...owner, businessId };
}

/**
 * Deactivates every other active venue until the returned restore runs. Once 05 is migrated,
 * `pnpm db:seed` adds venues identical to these three, and a tied score could send a cluster
 * to the seeded copy instead.
 */
export async function onlyTheseVenues(admin: SupabaseClient, keep: readonly string[]): Promise<() => Promise<void>> {
  const { data, error } = await admin.from('businesses').select('id').eq('is_active', true).not('id', 'in', `(${keep.join(',')})`);
  if (error) throw new Error(error.message);
  const others = (data as Array<{ id: string }>).map((row) => row.id);
  if (others.length === 0) return async () => {};
  const off = await admin.from('businesses').update({ is_active: false }).in('id', others);
  if (off.error) throw new Error(off.error.message);
  return async () => {
    await admin.from('businesses').update({ is_active: true }).in('id', others);
  };
}

/** 14 Scene 3 consumers (one demand opt-out) and the three venues, as itest users. */
export async function seedScene3(admin: SupabaseClient): Promise<Scene3World> {
  const rows = scene3 as Row[];
  const consumers = new Map<string, TestUser>();
  for (const row of rows) consumers.set(row.email, await seedConsumer(admin, row));
  const owners = new Map<string, TestUser & { businessId: string }>();
  for (const v of VENUES) owners.set(v.name, await seedVenue(admin, v));
  const optedOut = rows.find((r) => !r.allowDemandAggregation) as Row;
  return { consumers, owners, optedOutId: (consumers.get(optedOut.email) as TestUser).id };
}
