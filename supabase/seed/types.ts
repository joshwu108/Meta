import { z } from 'zod';
import { eventCategorySchema, notificationTypeSchema, visibilitySchema } from '../../src/shared/schemas/enums';

export const seedUserSchema = z.object({
  email: z.string().email(),
  display_name: z.string().min(1).max(60),
  neighborhood: z.string(),
  coarse_lat: z.number(),
  coarse_lng: z.number(),
  is_discoverable: z.boolean(),
  bio: z.string().max(500).optional(),
  onboarding_completed: z.boolean().default(true),
});
export type SeedUser = z.infer<typeof seedUserSchema>;

export const seedBusinessSchema = z.object({
  slug: z.string(),
  name: z.string(),
  category: eventCategorySchema,
  neighborhood: z.string(),
  address: z.string(),
  description: z.string(),
  lat: z.number(),
  lng: z.number(),
  capacity: z.number().int().positive(),
  owner: z.object({ email: z.string().email(), display_name: z.string() }),
  /** Workstream 05 venue detail. Optional so a base fixture still loads. */
  hours: z.record(z.string(), z.array(z.tuple([z.string(), z.string()]))).optional(),
  capabilities: z
    .object({
      event_categories: z.array(eventCategorySchema).optional(),
      min_price_cents: z.number().int().nullable().optional(),
      max_price_cents: z.number().int().nullable().optional(),
      hosting_slots: z.array(z.string()).optional(),
      equipment_tags: z.array(z.string()).optional(),
      formats: z.array(z.string()).optional(),
      notes: z.string().nullable().optional(),
      accepts_ai_proposals: z.boolean().optional(),
    })
    .optional(),
});
export type SeedBusiness = z.infer<typeof seedBusinessSchema>;

export const seedEventSchema = z.object({
  slug: z.string(),
  business: z.string(),
  title: z.string(),
  category: eventCategorySchema,
  days_from_now: z.number().int().min(0),
  start_hour: z.number().int().min(0).max(23),
  duration_hours: z.number().positive(),
  capacity: z.number().int().positive(),
  price_cents: z.number().int().min(0),
  description: z.string(),
  format: z.string(),
});
export type SeedEvent = z.infer<typeof seedEventSchema>;

export const seedGroupSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  visibility: visibilitySchema,
  owner: z.string().email(),
  members: z.array(z.string().email()),
  interests: z.array(z.string()).default([]),
  /** Users with a pending invitation from the owner (workstream 03). */
  invited: z.array(z.string().email()).default([]),
});
export type SeedGroup = z.infer<typeof seedGroupSchema>;

export const seedConnectionSchema = z.object({
  requester: z.string().email(),
  recipient: z.string().email(),
  status: z.enum(['pending', 'accepted', 'declined']),
  message: z.string().max(280).optional(),
});
export type SeedConnection = z.infer<typeof seedConnectionSchema>;

export const seedBlockSchema = z.object({ blocker: z.string().email(), blocked: z.string().email() });
export type SeedBlock = z.infer<typeof seedBlockSchema>;

export const seedNotificationSchema = z.object({
  user: z.string().email(),
  type: notificationTypeSchema,
  payload: z.record(z.unknown()).default({}),
});
export type SeedNotification = z.infer<typeof seedNotificationSchema>;

/** Password for every seeded account (specs §6). */
export const SEED_PASSWORD = 'demo-pass-1234';
/** Every seeded auth user has an email under this domain; the runner deletes them before inserting. */
export const SEED_DOMAIN = 'weave.test';
