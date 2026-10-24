import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { TEST_DOMAIN, type TestUser } from '../helpers';

/**
 * Route-level integration helpers. Test files mock `@/lib/supabase/server` so `withAuth` gets the
 * signed-in client of whichever test user `actAs` selected; every query then runs under real RLS.
 */
export const session: { client: SupabaseClient<Database> | null } = { client: null };

export function actAs(user: TestUser): void {
  session.client = user.client;
}

type Handler = (req: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** Envelope as parsed JSON. `data` stays loose because tests assert on it field by field. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseData = any;
export type CallResult = { status: number; body: { ok: boolean; data?: LooseData; error?: { code: string; message: string; details?: unknown } } };

export async function call(
  handler: Handler,
  opts: { method?: string; path?: string; body?: unknown; params?: Record<string, string> } = {},
): Promise<CallResult> {
  const init: RequestInit = { method: opts.method ?? 'GET' };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'content-type': 'application/json' };
  }
  const res = await handler(new Request(`http://test${opts.path ?? '/'}`, init), { params: Promise.resolve(opts.params ?? {}) });
  return { status: res.status, body: await res.json() };
}

export type PrefsInput = {
  interests?: string[];
  categories?: string[];
  slots?: string[];
  goals?: string[];
  groupSize?: string | null;
  budgetMax?: number | null;
  radiusKm?: number;
  activity?: string[];
};

export type ConsentInput = { matching?: boolean; groupPlan?: boolean; demand?: boolean };

/** Remote test location so seeded San Francisco users never enter a test's candidate set. */
export const TEST_ORIGIN = { lat: 64.14, lng: -21.94, neighborhood: 'Test Harbor' };

let origin = TEST_ORIGIN;

/**
 * Give this test file its own coarse location (deterministic from `name`), so users another file
 * failed to clean up can never enter this file's candidate sets. Call once at the top of a file.
 */
export function setTestOrigin(name: string): void {
  const hash = [...name].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const lat = Math.round(((hash % 10_000) / 100 - 50) * 100) / 100;
  const lng = Math.round((((hash >>> 10) % 32_000) / 100 - 160) * 100) / 100;
  origin = { lat, lng, neighborhood: `Test ${name}` };
}

export function testOrigin(): typeof TEST_ORIGIN {
  return origin;
}

/**
 * Delete every integration-test user one at a time, retrying failures. Deleting users who share
 * groups and connections in parallel can deadlock on the cascades and leave users behind.
 */
export async function cleanupSocialUsers(admin: SupabaseClient<Database>): Promise<void> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const targets = (data?.users ?? []).filter((user) => user.email?.endsWith(`@${TEST_DOMAIN}`));
  for (const user of targets) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (!error) break;
    }
  }
}

/** Give a test user preferences, consent and a discoverable coarse location (02's tables, service role). */
export async function setProfile(
  admin: SupabaseClient<Database>,
  user: TestUser,
  prefs: PrefsInput = {},
  consent: ConsentInput = { matching: true, groupPlan: true },
  profile: { lat?: number; lng?: number; discoverable?: boolean; adult?: boolean; neighborhood?: string } = {},
): Promise<void> {
  const profileUpdate = await admin
    .from('profiles')
    .update({
      coarse_lat: profile.lat ?? origin.lat,
      coarse_lng: profile.lng ?? origin.lng,
      neighborhood: profile.neighborhood ?? origin.neighborhood,
      is_discoverable: profile.discoverable ?? true,
      is_adult_confirmed: profile.adult ?? true,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', user.id);
  if (profileUpdate.error) throw new Error(profileUpdate.error.message);
  const prefsUpsert = await admin.from('user_preferences').upsert({
    user_id: user.id,
    interests: prefs.interests ?? ['pottery', 'coffee'],
    interest_categories: prefs.categories ?? ['creative', 'food_drink'],
    availability_slots: prefs.slots ?? ['thu_eve'],
    social_goals: prefs.goals ?? ['make_friends'],
    group_size_pref: prefs.groupSize === undefined ? 'small' : prefs.groupSize,
    budget_max_cents: prefs.budgetMax === undefined ? 2500 : prefs.budgetMax,
    travel_radius_km: prefs.radiusKm ?? 5,
    activity_prefs: prefs.activity ?? ['beginner-friendly'],
  });
  if (prefsUpsert.error) throw new Error(prefsUpsert.error.message);
  const consentUpsert = await admin.from('agent_profiles').upsert({
    user_id: user.id,
    consent: {
      allow_matching: consent.matching ?? false,
      allow_demand_aggregation: consent.demand ?? false,
      allow_group_planning: consent.groupPlan ?? false,
      share_interests_with_attendees: false,
      share_name_with_business: false,
    },
  });
  if (consentUpsert.error) throw new Error(consentUpsert.error.message);
}
