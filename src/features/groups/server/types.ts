import type { PublicCard } from '@/features/matching';
import type { MemberRole, MembershipStatus, Visibility } from '@/shared/enums';
import type { PlanSuggestion } from '@/shared/schemas/social';
import type { EventSummary } from '@/shared/types';

/** Response shapes of the group routes (spec §6). */

export type GroupKind = 'interest' | 'private' | 'event';

export type GroupSummary = {
  id: string;
  name: string;
  description: string | null;
  interests: string[];
  visibility: Visibility;
  kind: GroupKind;
  memberCount: number;
  memberPreview: PublicCard[];
  myRole: MemberRole | null;
  myStatus: MembershipStatus | null;
  /** Pending invitation to answer when `myStatus` is 'invited'. */
  invitationId: string | null;
  /** Title of the first suggestion in the latest plan, for "next plan" on cards. */
  latestPlanTitle: string | null;
};

export type RosterMember = { user: PublicCard; role: MemberRole; status: MembershipStatus; joinedAt: string | null; isMe: boolean };

export type GroupPermissions = {
  canEdit: boolean;
  canInvite: boolean;
  canPlan: boolean;
  canVote: boolean;
  canTransfer: boolean;
  canLeave: boolean;
  canJoin: boolean;
};

export type PlanVotes = { counts: number[]; mine: number[] };

export type GroupPlanView = {
  id: string;
  groupId: string;
  requestText: string;
  createdAt: string;
  requestedBy: PublicCard | null;
  suggestions: PlanSuggestion[];
  /** Consenting members whose preferences were used. */
  membersIncluded: number;
  activeMemberCount: number;
  votes: PlanVotes;
  /** Per suggestion: a new activity that needs a venue and has ≥ 50% of members' votes (P1). */
  venueEligible: boolean[];
  /** Smallest group 04 will route to a venue (`MIN_COHORT_SIZE`). */
  venueMinMembers: number;
};

export type GroupEvent = { event: EventSummary; membersGoing: number; sharedWithGroup: boolean };

export type GroupDetail = GroupSummary & {
  creatorId: string;
  createdAt: string;
  members: RosterMember[];
  /** Pending invitees, visible to admins only. */
  invited: RosterMember[];
  permissions: GroupPermissions;
  upcomingEvents: GroupEvent[];
  latestPlan: GroupPlanView | null;
};
