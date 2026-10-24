import { z } from "zod";
import { AVAILABILITY_SLOT, EVENT_CATEGORY, EVENT_STATUS } from "@/shared/enums";

const id = z.string().uuid();

export const EventIdParams = z.object({ id });

export const RsvpBody = z.object({
  shareWithAttendees: z.boolean().optional(),
  shareWithBusiness: z.boolean().optional(),
});

export const InviteGroupBody = z.object({ groupId: id });

export const FeedbackBody = z.object({
  rating: z.number().int().min(1).max(5),
  metSomeone: z.boolean().optional(),
  comment: z.string().trim().max(500).optional(),
});

export const ReconnectBody = z.object({ toUserId: id });

export const EventsQuery = z.object({
  category: z.enum(EVENT_CATEGORY).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  radiusKm: z.coerce.number().positive().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const RecommendedQuery = z.object({ limit: z.coerce.number().int().min(1).max(30).default(10) });

export const NearbyQuery = z.object({ radiusKm: z.coerce.number().positive().max(50).default(5) });

export const FollowUpSuggestion = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(400),
  suggestedSlot: z.enum(AVAILABILITY_SLOT),
  suggestedBusinessCategory: z.enum(EVENT_CATEGORY),
  businessId: id.optional(),
});
export type FollowUpSuggestion = z.infer<typeof FollowUpSuggestion>;

/** `events` joined with its `businesses` row, as read from Postgres. */
export const EventRow = z.object({
  id,
  business_id: id,
  source: z.enum(["ai_proposal", "business_manual", "group_request"]),
  title: z.string(),
  description: z.string(),
  category: z.enum(EVENT_CATEGORY),
  format: z.string().nullable(),
  starts_at: z.string(),
  ends_at: z.string(),
  capacity: z.number().int(),
  price_cents: z.number().int().nullable(),
  status: z.enum(EVENT_STATUS),
  updated_at: z.string(),
  businesses: z.object({
    id,
    name: z.string(),
    category: z.enum(EVENT_CATEGORY),
    neighborhood: z.string().nullable(),
    address: z.string(),
    description: z.string().nullable(),
    image_url: z.string().nullable(),
    lat: z.coerce.number(),
    lng: z.coerce.number(),
  }),
});
export type EventRow = z.infer<typeof EventRow>;

export const EVENT_SELECT =
  "id, business_id, source, title, description, category, format, starts_at, ends_at, capacity, price_cents, status, updated_at, " +
  "businesses!inner(id, name, category, neighborhood, address, description, image_url, lat, lng)";

export const FollowUpIdParams = z.object({ id });
export const FollowUpActionBody = z.object({ action: z.enum(["accept", "dismiss"]) });
