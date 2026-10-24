/**
 * Cross-workstream types (specs/01-core-platform/specs.md §4, README §4).
 * Baseline shapes so every workstream compiles against the same contracts.
 * Full semantics are defined in the owning workstream's spec.
 */
import type {
  AvailabilitySlot,
  EventCategory,
  EventStatus,
  GroupSizePref,
  RsvpStatus,
  SocialGoal,
  ProposalStatus,
} from './enums';

export type {
  AgentActor,
  AvailabilitySlot,
  ConnectionStatus,
  EventCategory,
  EventStatus,
  GroupSizePref,
  MemberRole,
  MembershipStatus,
  NotificationType,
  ProposalStatus,
  RsvpStatus,
  SocialGoal,
  Visibility,
} from './enums';

/**
 * Owned by 02. Only the fields the user consented to share for a given purpose.
 * `interestCategories` is the EVENT_CATEGORY projection of `interests` (02 stores it; 03, 04 and
 * 06 score on it). `groupSizePref` is null until the user states one.
 */
export type SharablePreferences = {
  userId: string;
  interests: string[];
  interestCategories: EventCategory[];
  availabilitySlots: AvailabilitySlot[];
  socialGoals: SocialGoal[];
  groupSizePref: GroupSizePref | null;
  budgetMin: number | null;
  budgetMax: number | null;
  travelRadiusKm: number;
  activityPrefs: string[];
  coarseLat: number | null;
  coarseLng: number | null;
  neighborhood: string | null;
};

/** Owned by 03. */
export type CompatibilityResult = {
  score: number;
  breakdown: { interests: number; availability: number; social: number; location: number; budget: number };
  sharedInterests: string[];
  sharedSlots: AvailabilitySlot[];
  hardFilterFailed: null | 'distance' | 'blocked' | 'not_discoverable';
};

/** Owned by 04. */
export type VenueCriteria = {
  category: EventCategory;
  cohortSize: number;
  slot: AvailabilitySlot;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  budgetMax: number | null;
};

/** Owned by 05. */
export type BusinessMatch = { businessId: string; name: string; score: number; reasons: string[] };

/** Owned by 05. Public, non-sensitive business card shown to consumers. */
export type BusinessPublicCard = {
  id: string;
  name: string;
  category: EventCategory;
  neighborhood: string;
  address: string;
  description: string;
  imageUrl: string | null;
};

/** Owned by 06. */
export type EventSummary = {
  id: string;
  title: string;
  startsAt: string;
  status: EventStatus;
  business: BusinessPublicCard;
  rsvpStatus: RsvpStatus | null;
};

/** Owned by 06. */
export type EventPublic = EventSummary & {
  description: string;
  category: EventCategory;
  endsAt: string;
  capacity: number;
  confirmedCount: number;
  priceCents: number | null;
  format: string;
  source: 'ai_proposal' | 'business_manual' | 'group_request';
};

/** Owned by 04. Result of `runOpportunityPipeline`. */
export type OpportunityRunSummary = {
  runId: string;
  triggeredBy: 'manual' | 'cron';
  dryRun: boolean;
  clustersDetected: number;
  proposalsCreated: number;
  startedAt: string;
  finishedAt: string;
};

/** Owned by 02. What `explainRecommendation` is explaining: a person, an event or a group. */
export type ExplainTarget =
  | { kind: 'person'; preferences: SharablePreferences; displayName?: string }
  | { kind: 'event'; event: Record<string, unknown> }
  | { kind: 'group'; group: Record<string, unknown> };

/** Owned by 02. Input for `explainRecommendation` (spec 02 §5). */
export type ExplainInput = {
  /** The viewing user's sharable preferences. */
  viewer: SharablePreferences;
  target: ExplainTarget;
  /** Deterministic score breakdown from the caller (03 or 06). */
  breakdown: Record<string, unknown>;
};

/* ---------- owned by workstream 05 (business application) ---------- */
export type EventSource = 'ai_proposal' | 'business_manual' | 'group_request';

/** The only shape in which a cohort size may reach a business. Never a raw count. */
export type DemandBand = '4-5' | '6-9' | '10+' | '20+';

/** Weekday key used by `businesses.hours`. */
export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** `[["09:00","21:00"]]` — a day may have several open windows, or none when closed. */
export type OpenWindow = readonly [open: string, close: string];
export type WeeklyHours = Partial<Record<WeekdayKey, readonly OpenWindow[]>>;

export type BusinessCapabilities = {
  eventCategories: EventCategory[];
  capacity: number;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  hostingSlots: AvailabilitySlot[];
  equipmentTags: string[];
  formats: string[];
  notes: string | null;
  acceptsAiProposals: boolean;
};

/** What the owner sees of their own business, capability notes included. */
export type BusinessOwnerView = BusinessPublicCard & {
  slug: string;
  lat: number;
  lng: number;
  hours: WeeklyHours;
  isActive: boolean;
  capabilities: BusinessCapabilities;
};

export type BusinessEvent = {
  id: string;
  businessId: string;
  proposalId: string | null;
  source: EventSource;
  title: string;
  description: string;
  category: EventCategory;
  format: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  priceCents: number | null;
  status: EventStatus;
  publishedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  confirmedCount: number;
};

/** Fields a business owner may change when approving a proposal or editing an event. */
export type EventEdits = {
  title?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  capacity?: number;
  priceCents?: number | null;
  format?: string;
};

export type ProposalDemand = {
  band: DemandBand;
  neighborhoodLabel: string;
  topInterests: string[];
};

/** 04's LLM output, stored immutably in `event_proposals.proposal`. */
export type ProposalDocument = {
  title: string;
  description: string;
  category: EventCategory;
  format: string;
  intendedSocialExperience: string;
  suggestedSlot: AvailabilitySlot;
  suggestedStartTimeLocal: string;
  estimatedDurationMinutes: number;
  suggestedCapacity: number;
  suggestedPriceCents: number | null;
  priceRangeCents: { min: number; max: number } | null;
  demand: ProposalDemand;
  whySuggested: string;
  assumptionsToValidate: string[];
  disclaimers: 'demand_is_estimate'[];
  /** Stored alongside the document by 04 section 5.8; 05 recomputes it when absent. */
  suggestedStartsAt?: string;
};

/** Inbox row. Carries `demand.band`, never `member_count`. */
export type ProposalSummary = {
  id: string;
  status: ProposalStatus;
  title: string;
  category: EventCategory;
  suggestedSlot: AvailabilitySlot;
  suggestedStartsAt: string | null;
  demand: ProposalDemand;
  createdAt: string;
  expiresAt: string;
  resultingEventId: string | null;
};

export type ProposalDetail = ProposalSummary & {
  proposal: ProposalDocument;
  businessEdits: EventEdits | null;
  decisionNote: string | null;
  decidedAt: string | null;
};

export type ProposalDecisionInput = {
  decision: 'approve' | 'modify' | 'reject';
  edits?: EventEdits;
  note?: string;
  publish?: boolean;
};

/** Counts first, names only for attendees who consented. */
export type AttendeeEntry = { displayName: string | null; sharedInterests?: string[] };
export type AttendeeList = {
  confirmedCount: number;
  waitlistedCount: number;
  attendees: AttendeeEntry[];
};

/** P1 insights: banded only, by category x slot. */
export type InsightCell = { category: EventCategory; slot: AvailabilitySlot; band: DemandBand };
export type BusinessInsights = { withinKm: number; sinceDays: number; cells: InsightCell[] };
