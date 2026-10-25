import { describe, expect, it } from 'vitest';
import {
  canEdit,
  canInvite,
  canJoin,
  canPlan,
  canRemove,
  canTransfer,
  canView,
  canVote,
  type GroupFacts,
  type Membership,
} from '@/features/groups/server/authz';

const privateGroup: GroupFacts = { visibility: 'private', kind: 'private', creatorId: 'creator', archived: false };
const publicGroup: GroupFacts = { visibility: 'public', kind: 'interest', creatorId: 'creator', archived: false };
const owner: Membership = { role: 'owner', status: 'active' };
const admin: Membership = { role: 'admin', status: 'active' };
const member: Membership = { role: 'member', status: 'active' };
const invited: Membership = { role: 'member', status: 'invited' };
const left: Membership = { role: 'member', status: 'left' };

describe('group authorization', () => {
  it('lets anyone view public groups, but only invited or active members view private ones', () => {
    expect(canView(publicGroup, null)).toBe(true);
    expect(canView(privateGroup, null)).toBe(false);
    expect(canView(privateGroup, invited)).toBe(true);
    expect(canView(privateGroup, left)).toBe(false);
    expect(canView({ ...publicGroup, archived: true }, owner)).toBe(false);
  });

  it('lets only active owners and admins edit', () => {
    expect(canEdit(owner)).toBe(true);
    expect(canEdit(admin)).toBe(true);
    expect(canEdit(member)).toBe(false);
    expect(canEdit({ role: 'admin', status: 'left' })).toBe(false);
  });

  it('lets admins invite anywhere and members invite to public groups', () => {
    expect(canInvite(privateGroup, admin)).toBe(true);
    expect(canInvite(privateGroup, member)).toBe(false);
    expect(canInvite(publicGroup, member)).toBe(true);
    expect(canInvite(publicGroup, invited)).toBe(false);
    expect(canInvite(publicGroup, null)).toBe(false);
  });

  it('lets anyone join a public interest group, rejoin after leaving, but not after being removed', () => {
    expect(canJoin(publicGroup, null)).toEqual({ ok: true });
    expect(canJoin(publicGroup, left)).toEqual({ ok: true });
    expect(canJoin(publicGroup, { role: 'member', status: 'removed' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(canJoin(publicGroup, member)).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(canJoin(publicGroup, invited)).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(canJoin(privateGroup, null)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(canJoin({ ...publicGroup, kind: 'event' }, null)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(canJoin({ ...publicGroup, archived: true }, null)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('lets admins always plan, members plan in public groups or groups they created', () => {
    expect(canPlan(privateGroup, owner, 'x')).toBe(true);
    expect(canPlan(privateGroup, member, 'x')).toBe(false);
    expect(canPlan(privateGroup, member, 'creator')).toBe(true);
    expect(canPlan(publicGroup, member, 'x')).toBe(true);
    expect(canPlan(publicGroup, invited, 'x')).toBe(false);
  });

  it('lets active members vote and only the owner transfer', () => {
    expect(canVote(member)).toBe(true);
    expect(canVote(invited)).toBe(false);
    expect(canTransfer(owner)).toBe(true);
    expect(canTransfer(admin)).toBe(false);
  });

  it('never removes the owner and keeps admins removable only by the owner', () => {
    expect(canRemove(admin, owner)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(canRemove(owner, owner)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(canRemove(owner, admin)).toEqual({ ok: true });
    expect(canRemove(admin, admin)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(canRemove(admin, member)).toEqual({ ok: true });
    expect(canRemove(admin, invited)).toEqual({ ok: true });
    expect(canRemove(member, member)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(canRemove(admin, left)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(canRemove(admin, null)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});
