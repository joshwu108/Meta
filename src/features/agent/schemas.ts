import { z } from "zod";
import {
  AVAILABILITY_SLOT,
  EVENT_CATEGORY,
  GROUP_SIZE_PREF,
  SOCIAL_GOAL,
} from "@/shared/enums";

export const AvailabilitySlotSchema = z.enum(AVAILABILITY_SLOT);
export const EventCategorySchema = z.enum(EVENT_CATEGORY);
export const GroupSizePrefSchema = z.enum(GROUP_SIZE_PREF);
export const SocialGoalSchema = z.enum(SOCIAL_GOAL);

/** Lowercase kebab tag, e.g. "board-games". */
export const TagSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
  .pipe(z.string().min(1));

export const PREFERENCE_FIELDS = [
  "interests",
  "interestCategories",
  "availabilitySlots",
  "socialGoals",
  "groupSizePref",
  "budgetMinCents",
  "budgetMaxCents",
  "travelRadiusKm",
  "activityPrefs",
  "dealbreakers",
] as const;
export type PreferenceField = (typeof PREFERENCE_FIELDS)[number];

export const FieldSourceSchema = z.enum(["ai_inferred", "user_set"]);
export type FieldSource = z.infer<typeof FieldSourceSchema>;
export const FieldSourcesSchema = z.record(z.enum(PREFERENCE_FIELDS), FieldSourceSchema);
export type FieldSources = Partial<Record<PreferenceField, FieldSource>>;

const centsSchema = z.number().int().min(0).max(1_000_000).nullable();

export const UserPreferencesSchema = z.object({
  interests: z.array(TagSchema).max(50),
  interestCategories: z.array(EventCategorySchema),
  availabilitySlots: z.array(AvailabilitySlotSchema),
  socialGoals: z.array(SocialGoalSchema),
  groupSizePref: GroupSizePrefSchema.nullable(),
  budgetMinCents: centsSchema,
  budgetMaxCents: centsSchema,
  travelRadiusKm: z.number().min(1).max(25),
  activityPrefs: z.array(TagSchema).max(30),
  dealbreakers: z.array(TagSchema).max(30),
});
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const UserPreferencesWithSourcesSchema = UserPreferencesSchema.extend({
  fieldSources: FieldSourcesSchema,
});
export type UserPreferencesWithSources = UserPreferences & { fieldSources: FieldSources };

export const UserPreferencesPatchSchema = UserPreferencesSchema.partial()
  .strict()
  .refine(
    (p) =>
      p.budgetMinCents == null || p.budgetMaxCents == null || p.budgetMinCents <= p.budgetMaxCents,
    { message: "budgetMinCents must be <= budgetMaxCents", path: ["budgetMinCents"] },
  );
export type UserPreferencesPatch = z.infer<typeof UserPreferencesPatchSchema>;

export const EMPTY_PREFERENCES: UserPreferences = Object.freeze({
  interests: [],
  interestCategories: [],
  availabilitySlots: [],
  socialGoals: [],
  groupSizePref: null,
  budgetMinCents: null,
  budgetMaxCents: null,
  travelRadiusKm: 5,
  activityPrefs: [],
  dealbreakers: [],
}) as UserPreferences;

export const ExtractedPreferencesSchema = z.object({
  interests: z.array(z.object({ tag: z.string(), confidence: z.number().min(0).max(1) })),
  interestCategories: z.array(EventCategorySchema),
  availabilitySlots: z.array(AvailabilitySlotSchema),
  socialGoals: z.array(SocialGoalSchema),
  groupSizePref: GroupSizePrefSchema.nullable(),
  budgetMaxCents: z.number().int().nullable(),
  activityPrefs: z.array(z.string()),
  dealbreakers: z.array(z.string()),
  summary: z.string().max(400),
  followUpQuestion: z.string().nullable(),
  missingFields: z.array(z.string()),
});
export type ExtractedPreferences = z.infer<typeof ExtractedPreferencesSchema>;

export const CONSENT_KEYS = [
  "allow_matching",
  "allow_demand_aggregation",
  "allow_group_planning",
  "share_interests_with_attendees",
  "share_name_with_business",
] as const;
export type ConsentKey = (typeof CONSENT_KEYS)[number];

export const ConsentSchema = z
  .object({
    allow_matching: z.boolean(),
    allow_demand_aggregation: z.boolean(),
    allow_group_planning: z.boolean(),
    share_interests_with_attendees: z.boolean(),
    share_name_with_business: z.boolean(),
  })
  .strict();
export type Consent = z.infer<typeof ConsentSchema>;
export const ConsentPatchSchema = ConsentSchema.partial().strict();

export const DEFAULT_CONSENT: Consent = Object.freeze({
  allow_matching: false,
  allow_demand_aggregation: false,
  allow_group_planning: false,
  share_interests_with_attendees: false,
  share_name_with_business: false,
});

export const SharingPurposeSchema = z.enum(["matching", "demand", "group_plan"]);
export type SharingPurpose = z.infer<typeof SharingPurposeSchema>;

export const SuggestionCardSchema = z.object({
  kind: z.enum(["person", "event", "group", "preference_update"]),
  targetId: z.string(),
  title: z.string().max(120),
  subtitle: z.string().max(200).optional(),
  href: z.string().startsWith("/"),
  explanation: z.string().max(160),
  highlights: z.array(z.string()).max(3),
  patch: UserPreferencesPatchSchema.optional(),
});
export type SuggestionCard = z.infer<typeof SuggestionCardSchema>;

export const ChatRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  kind: z.enum(["onboarding", "chat"]),
  message: z.string().trim().min(1).max(2000),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export type ChatResponse = {
  conversationId: string;
  reply: string;
  suggestions?: SuggestionCard[];
  extracted?: ExtractedPreferences;
  done?: boolean;
};

export const CAPABILITIES = [
  "suggest_people",
  "suggest_events",
  "suggest_groups",
  "update_preference",
] as const;

/** Structured output of the `agent.chat` prompt. */
export const ChatModelOutputSchema = z.object({
  reply: z.string().min(1).max(1200),
  capabilities: z
    .array(
      z.object({
        name: z.enum(CAPABILITIES),
        patch: UserPreferencesPatchSchema.optional(),
      }),
    )
    .max(3),
});
export type ChatModelOutput = z.infer<typeof ChatModelOutputSchema>;

export const OnboardBasicsSchema = z.object({
  step: z.literal("basics"),
  neighborhood: z.string().trim().min(1).max(60),
  coarseLat: z.number().min(-90).max(90),
  coarseLng: z.number().min(-180).max(180),
  travelRadiusKm: z.number().min(1).max(25),
});
export type OnboardBasics = z.infer<typeof OnboardBasicsSchema>;

export const ConfirmRequestSchema = z.object({
  discoverable: z.boolean(),
  consent: ConsentSchema,
});
export type ConfirmRequest = z.infer<typeof ConfirmRequestSchema>;

export const ExplainOutputSchema = z.object({
  explanation: z.string().max(160),
  highlights: z.array(z.string()).max(3),
});
export type ExplainOutput = z.infer<typeof ExplainOutputSchema>;

export const FollowUpSuggestionSchema = z.object({
  title: z.string().max(100),
  description: z.string().max(400),
  suggestedSlot: AvailabilitySlotSchema,
  suggestedBusinessCategory: EventCategorySchema,
});
export type FollowUpSuggestion = z.infer<typeof FollowUpSuggestionSchema>;

export const AgentLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const FeedbackNoteSchema = z.object({
  at: z.string(),
  about: z.string().regex(/^(event|person|group):[\w-]{1,64}$/),
  signal: z.enum(["up", "down"]),
  note: z.string().trim().max(200).optional(),
});
export type FeedbackNote = z.infer<typeof FeedbackNoteSchema>;
export const FeedbackRequestSchema = FeedbackNoteSchema.omit({ at: true });
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;
