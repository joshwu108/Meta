import { z } from 'zod';
import { AVAILABILITY_SLOT, EVENT_CATEGORY, GROUP_SIZE_PREF } from '@/shared/enums';
import type { AvailabilitySlot, EventCategory, GroupSizePref } from '@/shared/enums';
import type { DemandBand } from '@/shared/types';

/** Every value of the shared `DemandBand` (README §4), in order; the zod enums below use it. */
export const DEMAND_BANDS = ['4-5', '6-9', '10+', '20+'] as const satisfies readonly DemandBand[];
export type { DemandBand };

/** What the model sees about a cohort (spec §5.5). No user ids, names, or exact coordinates. */
export type DemandBrief = {
  category: EventCategory;
  slot: AvailabilitySlot;
  neighborhoodLabel: string;
  demandBand: DemandBand;
  topInterests: { tag: string; count: number }[];
  groupSizeMode: GroupSizePref | null;
  budgetP50Cents: number | null;
  activityPrefs: string[];
};

export const FORBIDDEN_PHRASES = ['confirmed', 'guaranteed', 'will attend', 'booked'] as const;

/** Spec §5.7 ProposalDocument, as the model must return it. */
export const ProposalDocument = z.object({
  title: z.string().min(4).max(80),
  description: z.string().min(40).max(600),
  category: z.enum(EVENT_CATEGORY),
  format: z.string().max(200),
  intendedSocialExperience: z.string().max(200),
  suggestedSlot: z.enum(AVAILABILITY_SLOT),
  suggestedStartTimeLocal: z.string().regex(/^\d{2}:\d{2}$/),
  estimatedDurationMinutes: z.number().int().min(45).max(240),
  suggestedCapacity: z.number().int().min(4).max(60),
  suggestedPriceCents: z.number().int().min(0).nullable(),
  priceRangeCents: z.object({ min: z.number().int(), max: z.number().int() }).nullable(),
  demand: z.object({
    band: z.enum(DEMAND_BANDS),
    neighborhoodLabel: z.string(),
    topInterests: z.array(z.string()).max(5),
  }),
  whySuggested: z.string().max(400),
  assumptionsToValidate: z.array(z.string()).min(1).max(6),
  disclaimers: z.array(z.literal('demand_is_estimate')).default(['demand_is_estimate']),
});
export type ProposalDocument = z.infer<typeof ProposalDocument>;

/** P1 attendance estimate derived from the band only, so no raw count reaches a business (AC2). */
export type AttendanceEstimate = { min: number; max: number; confidence: 'low' | 'medium' };

/** Stored form: the validated document plus fields computed in code (spec §5.8, P1 estimate). */
export type StoredProposal = ProposalDocument & { suggestedStartsAt: string; attendanceEstimate: AttendanceEstimate };

const DemandRunRequest = z
  .object({
    dryRun: z.boolean().optional(),
    source: z.literal('demand').optional(),
  })
  .strict();

/** P1 (spec §6): 03's "Request venue" for one voted suggestion. */
export const GroupProposalRequest = z
  .object({
    source: z.literal('group'),
    groupId: z.string().uuid(),
    planId: z.string().uuid(),
    suggestionIndex: z.number().int().min(0).max(20),
  })
  .strict();
export type GroupProposalRequest = z.infer<typeof GroupProposalRequest>;

export const GenerateOpportunitiesRequest = z.union([GroupProposalRequest, DemandRunRequest]);
export type GenerateOpportunitiesRequest = z.infer<typeof GenerateOpportunitiesRequest>;

export const RunStats = z.object({
  usersConsidered: z.number().int(),
  clustersFound: z.number().int(),
  clustersSuppressed: z.number().int(),
  proposalsCreated: z.number().int(),
  skippedDuplicate: z.number().int(),
  unmatched: z.number().int(),
  llmFailures: z.number().int(),
  rejectedByValidator: z.number().int(),
});
export type RunStats = z.infer<typeof RunStats>;

export const EMPTY_STATS: RunStats = Object.freeze({
  usersConsidered: 0,
  clustersFound: 0,
  clustersSuppressed: 0,
  proposalsCreated: 0,
  skippedDuplicate: 0,
  unmatched: 0,
  llmFailures: 0,
  rejectedByValidator: 0,
});

export const RUN_STAGES = ['collecting', 'clustering', 'matching', 'drafting', 'done'] as const;
export type RunStage = (typeof RUN_STAGES)[number];

export const groupSizeSchema = z.enum(GROUP_SIZE_PREF);

/** Spec §6 P1 revise body. 05 sends `{ note }`; the numeric fields are owner overrides applied in code. */
export const ReviseProposalRequest = z
  .object({
    note: z.string().trim().min(1).max(500).optional(),
    priceCents: z.number().int().min(0).max(100_000).optional(),
    capacity: z.number().int().min(4).max(60).optional(),
    slot: z.enum(AVAILABILITY_SLOT).optional(),
  })
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'Give a note or at least one change' });
export type ReviseProposalRequest = z.infer<typeof ReviseProposalRequest>;

/** A proposal can be revised this many times (also enforced by the 0403 check constraint). */
export const MAX_REVISIONS = 3;
