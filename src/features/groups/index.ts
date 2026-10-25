/**
 * Public surface of workstream 03's groups feature (README §4). Other features import only from
 * here. Server-only: client components use `./components` and `./labels` instead.
 */
export { getGroupMemberIds, getPublicGroups, type PublicGroupCard } from './server/contracts';
export {
  createEventInvitations,
  getPendingEventInvitations,
  getPendingEventInviteeIds,
  type PendingEventInvitation,
} from './server/invitations';
export { listMyGroups } from './server/summaries';
export { getGroupVenueRequest, type GroupVenueRequest } from './server/venue-request';
export type {
  GroupDetail,
  GroupEvent,
  GroupPlanView,
  GroupSummary,
  RosterMember,
} from './server/types';
