import { z } from 'zod';
import { isoTimestampSchema, nullableTimestampSchema, uuidSchema } from './common';
import {
  availabilitySlotSchema,
  connectionStatusSchema,
  eventCategorySchema,
  memberRoleSchema,
  membershipStatusSchema,
  socialGoalSchema,
  visibilitySchema,
} from './enums';

/**
 * Workstream 03 schemas (specs/03-matching-and-groups/specs.md §4–§6): rows of the social tables,
 * request bodies of the social routes and the planner's LLM output.
 */

export const REPORT_REASON = ['harassment', 'spam', 'fake', 'safety', 'other'] as const;
export const INVITATION_KIND = ['group', 'event'] as const;
export const INVITATION_STATUS = ['pending', 'accepted', 'declined', 'expired'] as const;
export const GROUP_KIND = ['interest', 'private', 'event'] as const;

export const reportReasonSchema = z.enum(REPORT_REASON);
export type ReportReason = z.infer<typeof reportReasonSchema>;
export const invitationStatusSchema = z.enum(INVITATION_STATUS);

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export const connectionRowSchema = z.object({
  id: uuidSchema,
  requester_id: uuidSchema,
  recipient_id: uuidSchema,
  status: connectionStatusSchema,
  message: z.string().max(280).nullable(),
  created_at: isoTimestampSchema,
  responded_at: nullableTimestampSchema,
  updated_at: isoTimestampSchema,
});
export type ConnectionRow = z.infer<typeof connectionRowSchema>;

export const groupRowSchema = z.object({
  id: uuidSchema,
  name: z.string().min(2).max(80),
  description: z.string().max(1000).nullable(),
  interests: z.array(z.string()),
  visibility: visibilitySchema,
  kind: z.enum(GROUP_KIND),
  event_id: uuidSchema.nullable(),
  creator_id: uuidSchema,
  archived_at: nullableTimestampSchema,
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});
export type GroupRow = z.infer<typeof groupRowSchema>;

export const groupMemberRowSchema = z.object({
  group_id: uuidSchema,
  user_id: uuidSchema,
  role: memberRoleSchema,
  status: membershipStatusSchema,
  joined_at: nullableTimestampSchema,
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});
export type GroupMemberRow = z.infer<typeof groupMemberRowSchema>;

export const invitationRowSchema = z.object({
  id: uuidSchema,
  kind: z.enum(INVITATION_KIND),
  group_id: uuidSchema.nullable(),
  event_id: uuidSchema.nullable(),
  sender_id: uuidSchema,
  recipient_id: uuidSchema,
  status: invitationStatusSchema,
  created_at: isoTimestampSchema,
  responded_at: nullableTimestampSchema,
  updated_at: isoTimestampSchema,
});
export type InvitationRow = z.infer<typeof invitationRowSchema>;

// ---------------------------------------------------------------------------
// Group planner LLM output (prompt `groups.plan_activities`)
// ---------------------------------------------------------------------------

export const planSuggestionSchema = z.object({
  kind: z.enum(['existing_event', 'new_activity']),
  eventId: z.string().uuid().nullable(),
  title: z.string().min(1).max(120),
  description: z.string().max(300),
  category: eventCategorySchema,
  slot: availabilitySlotSchema,
  estimatedCostCents: z.number().int().min(0).nullable(),
  whyItFits: z.string().max(200),
  needsVenue: z.boolean(),
  /** Consenting members free in `slot`; set by the server, not the model. */
  freeCount: z.number().int().min(0).optional(),
});
export type PlanSuggestion = z.infer<typeof planSuggestionSchema>;

export const planOutputSchema = z.object({ suggestions: z.array(planSuggestionSchema).min(2).max(4) });
export type PlanOutput = z.infer<typeof planOutputSchema>;

// ---------------------------------------------------------------------------
// Request bodies and queries
// ---------------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

export const matchesQuerySchema = z.object({
  interest: optionalText(40),
  goal: socialGoalSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type MatchesQuery = z.infer<typeof matchesQuerySchema>;

export const connectionCreateSchema = z.object({ recipientId: uuidSchema, message: optionalText(280) }).strict();
export const connectionRespondSchema = z.object({ status: z.enum(['accepted', 'declined']) }).strict();
export const connectionListQuerySchema = z.object({ status: connectionStatusSchema.optional() });

export const reportCreateSchema = z.object({ reason: reportReasonSchema, details: optionalText(1000) }).strict();

const interestsSchema = z.array(z.string().trim().min(1).max(40)).max(12);

export const groupCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: optionalText(1000),
    interests: interestsSchema.default([]),
    visibility: visibilitySchema.default('private'),
  })
  .strict();
export type GroupCreate = z.infer<typeof groupCreateSchema>;

export const groupUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(1000).nullable(),
    interests: interestsSchema,
    visibility: visibilitySchema,
    transferOwnerTo: uuidSchema,
  })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'Provide at least one field to update' })
  .refine((body) => body.transferOwnerTo === undefined || Object.keys(body).length === 1, {
    message: 'Transfer ownership on its own, without other changes',
  });
export type GroupUpdate = z.infer<typeof groupUpdateSchema>;

export const groupListQuerySchema = z.object({
  discover: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((value) => value === '1' || value === 'true'),
});

export const groupInviteSchema = z.object({ userIds: z.array(uuidSchema).min(1).max(20) }).strict();
export const invitationRespondSchema = z.object({ status: z.enum(['accepted', 'declined']) }).strict();
export const planRequestSchema = z.object({ request: z.string().trim().min(1).max(500) }).strict();
export const planVoteSchema = z.object({ suggestionIndex: z.number().int().min(0).max(3) }).strict();

// P1 direct messages between accepted connections
export const messageCreateSchema = z.object({ body: z.string().trim().min(1).max(1000) }).strict();
export const messageListQuerySchema = z.object({ after: isoTimestampSchema.optional() });
