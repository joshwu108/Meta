import type {
  AvailabilitySlot,
  EventCategory,
  EventStatus,
  GroupSizePref,
  RsvpStatus,
  SocialGoal,
} from "./enums";

export type SharablePreferences = { userId: string; interests: string[]; availabilitySlots: AvailabilitySlot[]; socialGoals: SocialGoal[]; groupSizePref: GroupSizePref; budgetMin: number | null; budgetMax: number | null; travelRadiusKm: number; activityPrefs: string[]; coarseLat: number | null; coarseLng: number | null; neighborhood: string | null };
export type CompatibilityResult = { score: number; breakdown: { interests: number; availability: number; social: number; location: number; budget: number }; sharedInterests: string[]; sharedSlots: AvailabilitySlot[]; hardFilterFailed: null | 'distance' | 'blocked' | 'not_discoverable' };
export type VenueCriteria = { category: EventCategory; cohortSize: number; slot: AvailabilitySlot; centerLat: number; centerLng: number; radiusKm: number; budgetMax: number | null };
export type BusinessMatch = { businessId: string; name: string; score: number; reasons: string[] };
export type BusinessPublicCard = { id: string; name: string; category: EventCategory; neighborhood: string; address: string; description: string; imageUrl: string | null };
export type EventSummary = { id: string; title: string; startsAt: string; status: EventStatus; business: BusinessPublicCard; rsvpStatus: RsvpStatus | null };
export type EventPublic = EventSummary & { description: string; category: EventCategory; endsAt: string; capacity: number; confirmedCount: number; priceCents: number | null; format: string; source: 'ai_proposal' | 'business_manual' | 'group_request' };
