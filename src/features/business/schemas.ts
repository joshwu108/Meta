import { z } from 'zod';
import { AVAILABILITY_SLOT, EVENT_CATEGORY } from '@/shared/enums';

/**
 * Zod is the single source of truth for every 05 request body (specs/README.md section 1).
 * Nothing in this workstream reads `req.json()` without passing it through one of these.
 */

export const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const timeOfDay = z.string().regex(TIME_OF_DAY, 'expected HH:MM in 24-hour time');

const openWindow = z
  .tuple([timeOfDay, timeOfDay])
  .refine(([open, close]) => close > open, { message: 'a closing time must be after its opening time' });

export const weeklyHoursSchema = z
  .record(z.enum(WEEKDAYS), z.array(openWindow).max(3))
  .default({});

export const businessProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).optional(),
  category: z.enum(EVENT_CATEGORY),
  imageUrl: z.string().url().max(500).nullish(),
});

export const businessLocationSchema = z.object({
  address: z.string().trim().min(4).max(200),
  neighborhood: z.string().trim().max(80).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  hours: weeklyHoursSchema,
});

export const businessCapabilitiesSchema = z
  .object({
    eventCategories: z.array(z.enum(EVENT_CATEGORY)).min(1).max(EVENT_CATEGORY.length),
    capacity: z.number().int().min(1).max(500),
    minPriceCents: z.number().int().min(0).max(1_000_000).nullish(),
    maxPriceCents: z.number().int().min(0).max(1_000_000).nullish(),
    hostingSlots: z.array(z.enum(AVAILABILITY_SLOT)).min(1),
    equipmentTags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    formats: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    notes: z.string().trim().max(500).nullish(),
    acceptsAiProposals: z.boolean().default(true),
  })
  .refine(
    (c) => c.minPriceCents == null || c.maxPriceCents == null || c.maxPriceCents >= c.minPriceCents,
    { message: 'the maximum price must be at least the minimum price', path: ['maxPriceCents'] },
  );

/** `POST /api/business` — the whole onboarding form in one submit. */
export const businessOnboardingSchema = z.object({
  profile: businessProfileSchema,
  location: businessLocationSchema,
  capabilities: businessCapabilitiesSchema,
});

/** `PATCH /api/business/me` — any subset of the three sections. */
export const businessUpdateSchema = z
  .object({
    profile: businessProfileSchema.partial(),
    location: businessLocationSchema.partial(),
    capabilities: businessCapabilitiesSchema.innerType().partial(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'nothing to update' });

/** Fields an owner may change on a proposal or an existing event (spec section 5). */
export const eventEditsSchema = z
  .object({
    title: z.string().trim().min(4).max(80),
    description: z.string().trim().min(1).max(1500),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    capacity: z.number().int().min(1).max(500),
    priceCents: z.number().int().min(0).max(1_000_000).nullable(),
    format: z.string().trim().max(200),
  })
  .partial()
  .refine((e) => !(e.startsAt && e.endsAt) || e.endsAt > e.startsAt, {
    message: 'an event must end after it starts',
    path: ['endsAt'],
  });

/** `POST /api/business/events` — a manually created event. */
export const eventInputSchema = z
  .object({
    title: z.string().trim().min(4).max(80),
    description: z.string().trim().min(1).max(1500),
    category: z.enum(EVENT_CATEGORY),
    format: z.string().trim().max(200).nullish(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    capacity: z.number().int().min(1).max(500),
    priceCents: z.number().int().min(0).max(1_000_000).nullish(),
    publish: z.boolean().default(false),
  })
  .refine((e) => e.endsAt > e.startsAt, {
    message: 'an event must end after it starts',
    path: ['endsAt'],
  });

export const REJECTION_REASONS = [
  'wrong_time',
  'no_capacity',
  'not_our_thing',
  'price_too_low',
  'staffing',
  'other',
] as const;

/** `PATCH /api/business/proposals/:id`. */
export const proposalDecisionSchema = z
  .object({
    decision: z.enum(['approve', 'modify', 'reject']),
    edits: eventEditsSchema.optional(),
    reason: z.enum(REJECTION_REASONS).optional(),
    note: z.string().trim().max(500).optional(),
    publish: z.boolean().default(false),
  })
  .refine((body) => body.decision !== 'modify' || body.edits !== undefined, {
    message: 'an edited approval must include the edits',
    path: ['edits'],
  })
  .refine((body) => body.decision !== 'reject' || body.reason !== undefined, {
    message: 'a rejection must include a reason',
    path: ['reason'],
  });

export const cancelEventSchema = z.object({
  reason: z.string().trim().min(4).max(500),
});

export type BusinessOnboardingInput = z.infer<typeof businessOnboardingSchema>;
export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>;
export type EventEditsInput = z.infer<typeof eventEditsSchema>;
export type EventInput = z.infer<typeof eventInputSchema>;
export type ProposalDecisionBody = z.infer<typeof proposalDecisionSchema>;
export type RejectionReason = (typeof REJECTION_REASONS)[number];
