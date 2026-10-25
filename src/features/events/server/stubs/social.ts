// 03's social graph, groups and invitations (now on main), re-exported under the names 06's
// modules already import. Same signatures as the stand-ins they replace.
export {
  getBlockEdges,
  getConnectionIds,
  getPendingConnectionRequests,
  getSuggestedPeople,
  type PendingConnectionRequest,
  type SuggestedPerson,
} from "@/features/matching";
export {
  createEventInvitations,
  getGroupMemberIds,
  getPendingEventInviteeIds,
  getPendingEventInvitations,
  getPublicGroups,
  type PendingEventInvitation,
  type PublicGroupCard as GroupCard,
} from "@/features/groups";
