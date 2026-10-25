import { z } from 'zod';

/**
 * Workstream 07 shapes shared by the server, the routes and the client. Model outputs are
 * validated here before any code trusts them; their fixtures live in src/lib/ai/fixtures.
 */

export const SCREEN_KINDS = ['your_algorithm', 'explore_grid', 'other'] as const;
export const TOPIC_STATES = ['listed', 'see_more', 'see_less'] as const;

/** Output of `import.read_screens`: what is visible on each screenshot, labels only. */
export const ReadScreensOutputSchema = z.object({
  screens: z
    .array(
      z.object({
        kind: z.enum(SCREEN_KINDS),
        summary: z.string().max(300).nullable(),
        topics: z
          .array(z.object({ label: z.string().min(1).max(64), state: z.enum(TOPIC_STATES) }))
          .max(60),
        themes: z.array(z.object({ label: z.string().min(1).max(64), tiles: z.number().int().min(1).max(30) })).max(30),
      }),
    )
    .min(1)
    .max(4),
});
export type ReadScreensOutput = z.infer<typeof ReadScreensOutputSchema>;

/** Output of `import.map_labels`: leftover labels mapped onto the closed vocabulary. */
export const MapLabelsOutputSchema = z.object({
  mappings: z
    .array(
      z.object({
        id: z.string().max(10),
        field: z.enum(['interests', 'activity_prefs']),
        value: z.string().max(40),
        quality: z.enum(['exact', 'close']),
      }),
    )
    .max(60),
});
export type MapLabelsOutput = z.infer<typeof MapLabelsOutputSchema>;

export const SUGGESTION_FIELDS = ['interests', 'activity_prefs', 'dislike'] as const;
export type SuggestionField = (typeof SUGGESTION_FIELDS)[number];
export const BANDS = ['strong', 'some', 'weak'] as const;
export type Band = (typeof BANDS)[number];

/** A pending suggestion as the review screen sees it. */
export type TraitSuggestion = {
  id: string;
  field: SuggestionField;
  value: string;
  label: string;
  category: string | null;
  confidence: number;
  band: Band;
  evidence: string[];
  expiresAt: string;
};

export const DECIDE_ACTIONS = ['love', 'yes', 'edit', 'not_me', 'keep_dislike', 'ignore'] as const;
export type DecideAction = (typeof DECIDE_ACTIONS)[number];

export const DecideRequestSchema = z.object({
  decisions: z
    .array(
      z.object({
        id: z.string().uuid(),
        action: z.enum(DECIDE_ACTIONS),
        value: z.string().trim().min(1).max(40).optional(),
      }),
    )
    .min(1)
    .max(50),
});
export type DecideRequest = z.infer<typeof DecideRequestSchema>;

export type DecideResult = {
  added: number;
  dismissed: number;
  dislikes: number;
  /** The saved preference lists when anything was added, else null. */
  profile: { interests: string[]; activityPrefs: string[] } | null;
};

export type ScreensRunResult = {
  runId: string;
  suggestionsCreated: number;
  dropped: { sensitive: number; unmapped: number; duplicate: number };
  aiUsed: boolean;
};

export const PLAN_ACTIONS = ['connect', 'rsvp', 'invite_group', 'open_place', 'create_group'] as const;
export type PlanAction = (typeof PLAN_ACTIONS)[number];

/** Output of `import.plan`: cards that only reference candidates by ref, never by name or id. */
export const PlanOutputSchema = z.object({
  cards: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        why: z.string().min(1).max(160),
        steps: z
          .array(
            z.object({
              ref: z.string().regex(/^(person|event|place|group):\d{1,2}$/),
              action: z.enum(PLAN_ACTIONS),
              label: z.string().min(1).max(60),
            }),
          )
          .min(1)
          .max(4),
      }),
    )
    .max(3),
});
export type PlanOutput = z.infer<typeof PlanOutputSchema>;

export type PlanViewStep = {
  ref: string;
  action: PlanAction;
  label: string;
  targetId: string | null;
  href: string;
  done: boolean;
  doneKey: string;
};

/** "Your plan" as the client sees it; done state comes from real data or a manual tap. */
export type PlanView = {
  cards: Array<{ title: string; why: string; steps: PlanViewStep[] }>;
  aiUsed: boolean;
  updatedAt: string;
};

/** /agent/import/settings: what came from Instagram, for the owner only. */
export type ImportSettings = {
  added: Array<{ field: 'interests' | 'activity_prefs'; value: string; strength: 'love' | 'yes'; confirmedAt: string }>;
  dislikes: Array<{ label: string; source: 'not_me' | 'see_less' }>;
  pending: number;
  lastImportAt: string | null;
};

/** Labels the browser extracted from a Download-your-information export (Phase 3). Strict: nothing else is accepted. */
export const ExportLabelsSchema = z
  .object({
    topics: z.array(z.string().trim().min(1).max(64)).max(300),
    adInterests: z.array(z.string().trim().min(1).max(64)).max(300),
  })
  .strict()
  .refine((v) => v.topics.length + v.adInterests.length > 0, { message: 'No topics or ad interests found' });
export type ExportLabels = z.infer<typeof ExportLabelsSchema>;
