/**
 * Shared enums (specs/README.md §2). These arrays are the single source of truth for
 * status values across every workstream; the matching `*Schema` Zod enums live in
 * `src/shared/schemas/enums.ts` and the TS unions are derived here.
 */

export const EVENT_STATUS = [
  'proposed',
  'awaiting_approval',
  'approved_draft',
  'published',
  'full',
  'completed',
  'cancelled',
] as const;
export const PROPOSAL_STATUS = ['pending', 'approved', 'modified', 'rejected', 'expired'] as const;
export const CONNECTION_STATUS = ['pending', 'accepted', 'declined'] as const;
export const MEMBERSHIP_STATUS = ['invited', 'active', 'removed', 'left'] as const;
export const MEMBER_ROLE = ['owner', 'admin', 'member'] as const;
export const RSVP_STATUS = ['confirmed', 'cancelled', 'waitlisted'] as const;
export const VISIBILITY = ['public', 'private'] as const;
/** 2 / 3-6 / 7-12 / 13+ */
export const GROUP_SIZE_PREF = ['one_on_one', 'small', 'medium', 'large'] as const;
export const SOCIAL_GOAL = [
  'make_friends',
  'explore_city',
  'learn_skill',
  'find_activity_partners',
  'network',
] as const;
export const EVENT_CATEGORY = [
  'creative',
  'food_drink',
  'games',
  'outdoors',
  'fitness',
  'learning',
  'music',
  'community',
] as const;
export const AVAILABILITY_SLOT = [
  'mon_eve',
  'tue_eve',
  'wed_eve',
  'thu_eve',
  'fri_eve',
  'sat_day',
  'sat_eve',
  'sun_day',
  'sun_eve',
] as const;
export const NOTIFICATION_TYPE = [
  'connection_request',
  'connection_accepted',
  'group_invite',
  'event_recommended',
  'event_published',
  'rsvp_confirmed',
  'event_updated',
  'event_cancelled',
  'proposal_received',
  'proposal_decided',
  'reconnect_suggestion',
] as const;
/** Actors recorded in `agent_action_log.actor`. */
export const AGENT_ACTOR = ['personal_agent', 'coordination', 'demand_engine', 'planning_agent'] as const;

export type EventStatus = (typeof EVENT_STATUS)[number];
export type ProposalStatus = (typeof PROPOSAL_STATUS)[number];
export type ConnectionStatus = (typeof CONNECTION_STATUS)[number];
export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[number];
export type MemberRole = (typeof MEMBER_ROLE)[number];
export type RsvpStatus = (typeof RSVP_STATUS)[number];
export type Visibility = (typeof VISIBILITY)[number];
export type GroupSizePref = (typeof GROUP_SIZE_PREF)[number];
export type SocialGoal = (typeof SOCIAL_GOAL)[number];
export type EventCategory = (typeof EVENT_CATEGORY)[number];
export type AvailabilitySlot = (typeof AVAILABILITY_SLOT)[number];
export type NotificationType = (typeof NOTIFICATION_TYPE)[number];
export type AgentActor = (typeof AGENT_ACTOR)[number];

/** Default minimum cohort size before a business may see a demand count (README §3, invariant 5). */
export const DEFAULT_MIN_COHORT_SIZE = 4;
