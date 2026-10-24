import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { TestUser } from '../helpers';

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
      coarse_lat: profile.lat ?? TEST_ORIGIN.lat,
      coarse_lng: profile.lng ?? TEST_ORIGIN.lng,
      neighborhood: profile.neighborhood ?? TEST_ORIGIN.neighborhood,
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
