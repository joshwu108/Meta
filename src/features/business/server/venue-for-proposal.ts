import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AvailabilitySlot, EventCategory } from '@/shared/enums';
import type { BusinessCapabilities, BusinessPublicCard } from '@/shared/types';
import { ApiError } from '@/lib/api/errors';

/**
 * Everything workstream 04 needs to draft a proposal for one venue, and nothing more.
 * `ownerId` is included so 04 can notify the owner; it must never reach the model.
 *
 * This lives in 05 because 05 owns `businesses` and `business_capabilities`. It exists so 04
 * does not read those tables itself: the public card alone is not enough (no owner, no
 * capabilities) and `findBusinessById` does not expose `owner_id`.
 */
export type VenueForProposal = {
  card: BusinessPublicCard;
  ownerId: string;
  capabilities: BusinessCapabilities;
};

type Row = {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  neighborhood: string | null;
  address: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  business_capabilities: {
    event_categories: string[];
    capacity: number;
    min_price_cents: number | null;
    max_price_cents: number | null;
    hosting_slots: string[];
    equipment_tags: string[];
    formats: string[];
    notes: string | null;
    accepts_ai_proposals: boolean;
  } | null;
};

const SELECT =
  'id, owner_id, name, category, neighborhood, address, description, image_url, is_active, business_capabilities(*)';

/**
 * Null when the venue is unknown, inactive, has no capabilities row, or has opted out of AI
 * proposals -- all of which mean "do not draft for this venue", not an error.
 */
export async function getVenueForProposal(db: SupabaseClient, businessId: string): Promise<VenueForProposal | null> {
  const { data, error } = await db.from('businesses').select(SELECT).eq('id', businessId).maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'could not load the venue', 500, { code: error.code });
  if (!data) return null;

  const row = data as unknown as Row;
  const c = row.business_capabilities;
  if (!row.is_active || !c || !c.accepts_ai_proposals) return null;

  return {
    card: {
      id: row.id,
      name: row.name,
      category: row.category as EventCategory,
      neighborhood: row.neighborhood ?? '',
      address: row.address,
      description: row.description ?? '',
      imageUrl: row.image_url,
    },
    ownerId: row.owner_id,
    capabilities: {
      eventCategories: c.event_categories as EventCategory[],
      capacity: c.capacity,
      minPriceCents: c.min_price_cents,
      maxPriceCents: c.max_price_cents,
      hostingSlots: c.hosting_slots as AvailabilitySlot[],
      equipmentTags: c.equipment_tags,
      formats: c.formats,
      notes: c.notes,
      acceptsAiProposals: c.accepts_ai_proposals,
    },
  };
}
