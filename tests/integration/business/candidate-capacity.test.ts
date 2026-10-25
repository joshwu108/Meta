/**
 * Regression: a venue smaller than the local cohort must still be a candidate.
 *
 * `business_candidates` used to require `capacity >= p_cohort_size`, which hid every venue
 * smaller than the demand around it -- a 12-seat cafe next to a 19-person cohort was dropped
 * while a 30-seat venue two kilometres away matched. A cohort counts *interested* people, not
 * attendees (turnout is modelled separately and capped at capacity), so capacity belongs in the
 * ranking, not the prefilter. Only venues below the minimum cohort size are excluded.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));
process.env.MOCK_AI = '1';

const { adminClient } = await import('../helpers');

const admin = adminClient() as unknown as SupabaseClient;

const LAT = 37.771;
const LNG = -122.414;
const COHORT = 19;
const SUFFIX = `cap-${Date.now()}`;

type Venue = { id: string; ownerId: string };

async function makeVenue(label: string, capacity: number): Promise<Venue> {
  const email = `owner.${label}.${SUFFIX}@itest.commonground.test`;
  const { data: user, error: userError } = await admin.auth.admin.createUser({
    email,
    password: 'demo-pass-1234',
    email_confirm: true,
    user_metadata: { display_name: label, signup_as: 'business', is_adult_confirmed: true },
  });
  if (userError || !user.user) throw new Error(`createUser failed: ${userError?.message}`);

  const { data: biz, error: bizError } = await admin
    .from('businesses')
    .insert({
      owner_id: user.user.id,
      name: `${label} ${SUFFIX}`,
      slug: `${label}-${SUFFIX}`,
      category: 'games',
      address: '1 Test St',
      neighborhood: 'Testville',
      lat: LAT,
      lng: LNG,
    } as never)
    .select('id')
    .single();
  if (bizError || !biz) throw new Error(`insert business failed: ${bizError?.message}`);
  const id = (biz as { id: string }).id;

  const { error: capError } = await admin.from('business_capabilities').insert({
    business_id: id,
    event_categories: ['games'],
    capacity,
    hosting_slots: ['fri_eve'],
    equipment_tags: [],
    formats: [],
    accepts_ai_proposals: true,
  } as never);
  if (capError) throw new Error(`insert capabilities failed: ${capError.message}`);

  return { id, ownerId: user.user.id };
}

let small: Venue;
let large: Venue;
let tiny: Venue;

beforeAll(async () => {
  small = await makeVenue('small', 12);
  large = await makeVenue('large', 30);
  tiny = await makeVenue('tiny', 3);
}, 60_000);

afterAll(async () => {
  for (const venue of [small, large, tiny]) {
    if (venue?.ownerId) await admin.auth.admin.deleteUser(venue.ownerId);
  }
});

async function candidates(cohortSize: number): Promise<{ business_id: string; capacity: number }[]> {
  const { data, error } = await admin.rpc('business_candidates' as never, {
    p_category: 'games',
    p_cohort_size: cohortSize,
    p_lat: LAT,
    p_lng: LNG,
    p_radius_km: 3,
  } as never);
  if (error) throw new Error(`business_candidates failed: ${error.message}`);
  return data as unknown as { business_id: string; capacity: number }[];
}

describe('business_candidates capacity rule', () => {
  it('includes a venue smaller than the cohort', async () => {
    const ids = (await candidates(COHORT)).map((r) => r.business_id);
    // The regression: capacity 12 against a cohort of 19 used to be excluded outright.
    expect(ids).toContain(small.id);
    expect(ids).toContain(large.id);
  });

  it('excludes a venue below the minimum cohort size', async () => {
    const ids = (await candidates(COHORT)).map((r) => r.business_id);
    expect(ids).not.toContain(tiny.id);
  });

  it('still includes every qualifying venue when the cohort is small', async () => {
    const ids = (await candidates(4)).map((r) => r.business_id);
    expect(ids).toContain(small.id);
    expect(ids).toContain(large.id);
  });
});
