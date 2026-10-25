import type { MemberRole, MembershipStatus, Visibility } from '@/shared/enums';
import type { GroupRow } from '@/shared/schemas/social';

/**
 * Pure authorization rules for groups (specs/03-matching-and-groups/specs.md §5–§6). Services
 * check these before any service-role write; RLS enforces the same boundaries for reads.
 */

export type Membership = { role: MemberRole; status: MembershipStatus };
export type GroupFacts = { visibility: Visibility; kind: GroupRow['kind']; creatorId: string; archived: boolean };
export type Denial = { ok: false; code: 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT'; message: string };
export type Decision = { ok: true } | Denial;

const isActive = (m: Membership | null): m is Membership => m?.status === 'active';
const isAdmin = (m: Membership | null): m is Membership => isActive(m) && (m.role === 'owner' || m.role === 'admin');

/** Public groups are visible to everyone signed in; private ones to invited or active members. */
export function canView(group: GroupFacts, m: Membership | null): boolean {
  if (group.archived) return false;
  return group.visibility === 'public' || m?.status === 'active' || m?.status === 'invited';
}

/** Name, description, interests and visibility: active owners and admins. */
export function canEdit(m: Membership | null): boolean {
  return isAdmin(m);
}

/**
 * Anyone signed in may join a public interest group (not 06's event groups). Someone who left can
 * rejoin; someone an admin removed needs a new invitation, and an invitee answers their invitation.
 */
export function canJoin(group: GroupFacts, m: Membership | null): Decision {
  if (m?.status === 'active') return { ok: false, code: 'CONFLICT', message: 'You’re already in this group' };
  if (m?.status === 'invited') return { ok: false, code: 'VALIDATION', message: 'Accept your invitation to join this group' };
  if (group.archived || group.visibility !== 'public' || group.kind !== 'interest') {
    return { ok: false, code: 'FORBIDDEN', message: 'This group is invite-only' };
  }
  if (m?.status === 'removed') return { ok: false, code: 'FORBIDDEN', message: 'An admin removed you from this group. Ask them to invite you back.' };
  return { ok: true };
}

/** Admins, or any active member of a public group. */
export function canInvite(group: GroupFacts, m: Membership | null): boolean {
  return isAdmin(m) || (group.visibility === 'public' && isActive(m));
}

/** Owners/admins always; members if the group is public or they created it. */
export function canPlan(group: GroupFacts, m: Membership | null, userId: string): boolean {
  if (!isActive(m)) return false;
  return isAdmin(m) || group.visibility === 'public' || group.creatorId === userId;
}

export function canVote(m: Membership | null): boolean {
  return isActive(m);
}

export function canTransfer(m: Membership | null): boolean {
  return isActive(m) && m.role === 'owner';
}

/** Admins remove invited or active members; only the owner removes admins; nobody removes the owner. */
export function canRemove(actor: Membership | null, target: Membership | null): Decision {
  if (!isAdmin(actor)) return { ok: false, code: 'FORBIDDEN', message: 'Only group admins can remove members' };
  if (!target || (target.status !== 'active' && target.status !== 'invited')) {
    return { ok: false, code: 'NOT_FOUND', message: 'That person is not in this group' };
  }
  if (target.role === 'owner') return { ok: false, code: 'FORBIDDEN', message: 'The owner cannot be removed' };
  if (target.role === 'admin' && actor.role !== 'owner') {
    return { ok: false, code: 'FORBIDDEN', message: 'Only the owner can remove an admin' };
  }
  return { ok: true };
}
