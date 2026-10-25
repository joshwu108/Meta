import type { PublicCard } from '@/features/matching';
import type { MemberRole, MembershipStatus, Visibility } from '@/shared/enums';
import type { PlanSuggestion } from '@/shared/schemas/social';
import type { EventSummary } from '@/shared/types';

/** Response shapes of the group routes (spec §6). */

export type GroupKind = 'interest' | 'private' | 'event';

/** A group as the viewer sees it in lists: member count and a few public cards, plus the viewer's own role and status. */
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

/** One person on a group roster (public card only) with their role and membership status. */
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

/** A group's latest planner run, with vote tallies and which suggestions can be sent to 04 for a venue. */
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

/** An event on a group's Events tab: how many active members are going (never who), and whether it was shared with the group. */
export type GroupEvent = { event: EventSummary; membersGoing: number; sharedWithGroup: boolean };

/** `GET /api/groups/:id`: the summary plus roster, the viewer's permissions, upcoming events and the latest plan. */
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
