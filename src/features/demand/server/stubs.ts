import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AvailabilitySlot, EventCategory } from '@/shared/enums';
import type { BusinessMatch } from '@/shared/types';
import type { Venue } from './venue';

/**
 * Stand-ins for exports owned by other workstreams (README §5 "Stubs", spec §11).
 * Delete each when the real export reaches main:
 * - loadVenue             → 05 venue/capabilities export (requested in PROGRESS "Needs from others")
 * It reads 05's tables with the service role only because 05 has no capabilities export yet.
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
