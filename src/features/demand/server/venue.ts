import type { AvailabilitySlot, EventCategory } from '@/shared/enums';
import type { BusinessMatch, BusinessPublicCard } from '@/shared/types';

/**
 * Everything 04 needs about a candidate venue to draft and validate a proposal.
 * `card` is what the model sees; `ownerId` is used only to notify, never sent to the model.
 */
export type Venue = {
  match: BusinessMatch;
  card: BusinessPublicCard;
  ownerId: string;
  capabilities: {
    eventCategories: EventCategory[];
    capacity: number;
    hostingSlots: AvailabilitySlot[];
    minPriceCents: number | null;
    maxPriceCents: number | null;
    equipmentTags: string[];
    formats: string[];
  };
};

export type CapabilitySummary = {
  supportedCategories: EventCategory[];
  capacity: number;
  hostingSlots: AvailabilitySlot[];
  priceRangeCents: { min: number; max: number } | null;
  equipmentTags: string[];
  formats: string[];
};

/** Capability summary for the prompt (spec §5.7). */
export function capabilitySummary(venue: Venue): CapabilitySummary {
  const c = venue.capabilities;
  return {
    supportedCategories: c.eventCategories,
    capacity: c.capacity,
    hostingSlots: c.hostingSlots,
    priceRangeCents: c.minPriceCents == null && c.maxPriceCents == null ? null : { min: c.minPriceCents ?? 0, max: c.maxPriceCents ?? c.minPriceCents ?? 0 },
    equipmentTags: c.equipmentTags,
    formats: c.formats,
  };
}
