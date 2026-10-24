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

/** Owned by 02. Only the fields the user consented to share for a given purpose. */
export type SharablePreferences = {
  userId: string;
  interests: string[];
  availabilitySlots: AvailabilitySlot[];
  socialGoals: SocialGoal[];
  groupSizePref: GroupSizePref;
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

/** Owned by 02. Input for `explainRecommendation`. */
export type ExplainInput = {
  userId: string;
  subject: { kind: 'event' | 'person' | 'group'; id: string; title: string };
  signals: string[];
};
