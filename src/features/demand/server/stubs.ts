import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AvailabilitySlot, EventCategory } from '@/shared/enums';
import type { BusinessMatch } from '@/shared/types';
import type { DemandUser } from './categories';
import type { Venue } from './venue';

/**
 * Stand-ins for exports owned by other workstreams (README §5 "Stubs", spec §11).
 * Delete each when the real export reaches main:
 * - getSharableBatch      → 02 `getSharablePreferencesBatch(ids, 'demand')` from '@/features/agent'
 * - loadVenue             → 05 venue/capabilities export (requested in PROGRESS "Needs from others")
 * These read other workstreams' tables with the service role only because their contracts
 * have not landed; they apply the same consent rule 02 does.
 */

type PrefRow = {
  user_id: string; interests: string[]; interest_categories: string[]; availability_slots: string[];
  social_goals: string[]; group_size_pref: string | null; budget_min_cents: number | null;
  budget_max_cents: number | null; travel_radius_km: number | string; activity_prefs: string[];
};
type ProfileRow = { id: string; neighborhood: string | null; coarse_lat: number | string | null; coarse_lng: number | string | null };

const num = (v: number | string | null): number | null => (v == null ? null : Number(v));

function toDemandUser(p: PrefRow, profile: ProfileRow): DemandUser {
  return {
    userId: p.user_id,
    interests: p.interests,
    interestCategories: p.interest_categories as EventCategory[],
    availabilitySlots: p.availability_slots as AvailabilitySlot[],
    socialGoals: p.social_goals as DemandUser['socialGoals'],
    groupSizePref: p.group_size_pref as DemandUser['groupSizePref'],
    budgetMin: p.budget_min_cents,
    budgetMax: p.budget_max_cents,
    travelRadiusKm: Number(p.travel_radius_km),
    activityPrefs: p.activity_prefs,
    coarseLat: num(profile.coarse_lat),
    coarseLng: num(profile.coarse_lng),
    neighborhood: profile.neighborhood,
  };
}

/** Stub of 02's consent boundary for purpose 'demand': only users with allow_demand_aggregation. */
export async function stubSharableBatch(admin: SupabaseClient, ids: readonly string[]): Promise<Map<string, DemandUser>> {
  if (ids.length === 0) return new Map();
  const list = [...ids];
  const [agents, prefs, profiles] = await Promise.all([
    admin.from('agent_profiles').select('user_id, consent').in('user_id', list),
    admin.from('user_preferences').select('*').in('user_id', list),
    admin.from('profiles').select('id, neighborhood, coarse_lat, coarse_lng').in('id', list),
  ]);
  const failed = agents.error ?? prefs.error ?? profiles.error;
  if (failed) throw new Error(`demand collect failed: ${failed.message}`);
  const consenting = new Set(
    (agents.data as Array<{ user_id: string; consent: Record<string, unknown> | null }>)
      .filter((a) => a.consent?.['allow_demand_aggregation'] === true)
      .map((a) => a.user_id),
  );
  const byId = new Map((profiles.data as ProfileRow[]).map((p) => [p.id, p]));
  return new Map(
    (prefs.data as PrefRow[])
      .filter((p) => consenting.has(p.user_id) && byId.has(p.user_id))
      .map((p) => [p.user_id, toDemandUser(p, byId.get(p.user_id) as ProfileRow)]),
  );
}

type VenueRow = {
  id: string; owner_id: string; name: string; category: string; neighborhood: string | null; address: string;
  description: string | null; image_url: string | null; lat: number | string; lng: number | string; is_active: boolean;
  business_capabilities: {
    event_categories: string[]; capacity: number; hosting_slots: string[]; min_price_cents: number | null;
    max_price_cents: number | null; equipment_tags: string[]; formats: string[]; accepts_ai_proposals: boolean;
  } | null;
};

const VENUE_SELECT = 'id, owner_id, name, category, neighborhood, address, description, image_url, lat, lng, is_active, business_capabilities(*)';

function toVenue(row: VenueRow, match: BusinessMatch): Venue | null {
  const c = row.business_capabilities;
  if (!c || !row.is_active || !c.accepts_ai_proposals) return null;
  return {
    match,
    ownerId: row.owner_id,
    card: {
      id: row.id, name: row.name, category: row.category as EventCategory, neighborhood: row.neighborhood ?? '',
      address: row.address, description: row.description ?? '', imageUrl: row.image_url,
    },
    capabilities: {
      eventCategories: c.event_categories as EventCategory[], capacity: c.capacity, hostingSlots: c.hosting_slots as AvailabilitySlot[],
      minPriceCents: c.min_price_cents, maxPriceCents: c.max_price_cents, equipmentTags: c.equipment_tags, formats: c.formats,
    },
  };
}

export async function stubLoadVenue(admin: SupabaseClient, match: BusinessMatch): Promise<Venue | null> {
  const { data, error } = await admin.from('businesses').select(VENUE_SELECT).eq('id', match.businessId).maybeSingle();
  if (error) throw new Error(`venue lookup failed: ${error.message}`);
  return data ? toVenue(data as unknown as VenueRow, match) : null;
}
