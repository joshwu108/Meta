import { z } from 'zod';
import {
  AGENT_ACTOR,
  AVAILABILITY_SLOT,
  CONNECTION_STATUS,
  EVENT_CATEGORY,
  EVENT_STATUS,
  GROUP_SIZE_PREF,
  MEMBER_ROLE,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TYPE,
  PROPOSAL_STATUS,
  RSVP_STATUS,
  SOCIAL_GOAL,
  VISIBILITY,
} from '../enums';

/** Zod enums mirroring `src/shared/enums.ts`. */
export const eventStatusSchema = z.enum(EVENT_STATUS);
export const proposalStatusSchema = z.enum(PROPOSAL_STATUS);
export const connectionStatusSchema = z.enum(CONNECTION_STATUS);
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUS);
export const memberRoleSchema = z.enum(MEMBER_ROLE);
export const rsvpStatusSchema = z.enum(RSVP_STATUS);
export const visibilitySchema = z.enum(VISIBILITY);
export const groupSizePrefSchema = z.enum(GROUP_SIZE_PREF);
export const socialGoalSchema = z.enum(SOCIAL_GOAL);
export const eventCategorySchema = z.enum(EVENT_CATEGORY);
export const availabilitySlotSchema = z.enum(AVAILABILITY_SLOT);
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPE);
export const agentActorSchema = z.enum(AGENT_ACTOR);
