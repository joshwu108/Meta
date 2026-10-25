import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AvailabilitySlot, EventCategory } from '@/shared/enums';
import type { BusinessMatch, VenueCriteria } from '@/shared/types';
import { haversineKm } from './geo';
import type { Venue } from './venue';

/**
 * Stand-ins for exports owned by other workstreams (README §5 "Stubs", spec §11).
 * Delete each when the real export reaches main:
 * - getSharableBatch      → 02 `getSharablePreferencesBatch(ids, 'demand')` from '@/features/agent'
 * - findCandidates        → 05 `findCandidateBusinesses(criteria)` from '@/features/business'
 * - loadVenue             → 05 venue/capabilities export (requested in PROGRESS "Needs from others")
 * These read other workstreams' tables with the service role only because their contracts
 * have not landed; they apply the same consent rule 02 does.
 */

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

/** Stub of 05's prefilter + 04 §5.6 weighting. */
export async function stubFindCandidates(admin: SupabaseClient, criteria: VenueCriteria): Promise<BusinessMatch[]> {
  const { data, error } = await admin.from('businesses').select(VENUE_SELECT).eq('is_active', true);
  if (error) throw new Error(`candidate lookup failed: ${error.message}`);
  const center = { lat: criteria.centerLat, lng: criteria.centerLng };
  return (data as unknown as VenueRow[])
    .flatMap((row) => {
      const c = row.business_capabilities;
      if (!c || !c.accepts_ai_proposals || !c.event_categories.includes(criteria.category) || c.capacity < criteria.cohortSize) return [];
      const distance = haversineKm(center, { lat: Number(row.lat), lng: Number(row.lng) });
      if (distance > criteria.radiusKm) return [];
      const priceOverlap = criteria.budgetMax == null || c.min_price_cents == null || c.min_price_cents <= criteria.budgetMax ? 1 : 0;
      const score = 0.4 * Math.min(1, criteria.cohortSize / c.capacity) + 0.3 * (c.hosting_slots.includes(criteria.slot) ? 1 : 0)
        + 0.2 * (1 - distance / criteria.radiusKm) + 0.1 * priceOverlap;
      return [{ businessId: row.id, name: row.name, score: Math.round(score * 1000) / 1000, reasons: [] }];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
