'use client';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Avatar, Button, Card, StatusPill, useToast } from '@/features/core/components/ui';
import { useApiAction } from '@/lib/api/use-api-action';
import type { GroupDetail, RosterMember } from '../server/types';
import { ConfirmSheet, type Confirmation } from './ConfirmSheet';
import { InvitePicker, type InviteCandidate } from './InvitePicker';

function canRemoveMember(group: GroupDetail, member: RosterMember): boolean {
  if (!group.permissions.canEdit || member.isMe || member.role === 'owner') return false;
  return member.role !== 'admin' || group.myRole === 'owner';
}

function MemberRow({ member, actions }: { member: RosterMember; actions: ReactNode }) {
  return (
    <li className="flex min-h-[64px] flex-wrap items-center gap-3 py-2">
      <Avatar name={member.user.displayName} src={member.user.avatarUrl} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {member.user.displayName}
          {member.isMe && <span className="font-normal text-text-2"> (you)</span>}
        </p>
        {member.user.neighborhood && <p className="truncate text-[length:var(--text-sm)] text-text-2">{member.user.neighborhood}</p>}
      </div>
      {member.status === 'invited' ? <StatusPill status="invited" /> : member.role !== 'member' && <StatusPill status={member.role} />}
      <div className="flex items-center gap-1">{actions}</div>
    </li>
  );
}

function useMemberActions(group: GroupDetail) {
  const router = useRouter();
  const { toast } = useToast();
  const { run, pending } = useApiAction(toast);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const close = () => setConfirmation(null);
  const remove = (member: RosterMember) =>
    setConfirmation({
      title: member.status === 'invited' ? `Cancel ${member.user.displayName}’s invitation?` : `Remove ${member.user.displayName}?`,
      body: 'They lose access to the group’s plans and members. You can invite them again later.',
      confirmLabel: member.status === 'invited' ? 'Cancel invitation' : 'Remove',
      tone: 'danger',
      onConfirm: async () => (await run('confirm', `/api/groups/${group.id}/members/${member.user.id}`, { method: 'DELETE' }, { success: 'Done' })) && close(),
    });
  const transfer = (member: RosterMember) =>
    setConfirmation({
      title: `Make ${member.user.displayName} the owner?`,
      body: 'You’ll stay on as an admin. Only the owner can hand ownership on.',
      confirmLabel: 'Make owner',
      onConfirm: async () => (await run('confirm', `/api/groups/${group.id}`, { method: 'PATCH', body: { transferOwnerTo: member.user.id } }, { success: `${member.user.displayName} is now the owner` })) && close(),
    });
  const leave = () =>
    setConfirmation({
      title: group.memberCount <= 1 ? 'Leave and archive this group?' : `Leave ${group.name}?`,
      body: group.memberCount <= 1 ? 'You’re the last member, so the group will be archived.' : 'You can rejoin if someone invites you again.',
      confirmLabel: 'Leave group',
      tone: 'danger',
      onConfirm: async () => {
        if (await run('confirm', `/api/groups/${group.id}/leave`, { method: 'POST' }, { success: 'You left the group', refresh: false })) router.push('/groups');
      },
    });
  return { confirmation, close, remove, transfer, leave, isPending: pending === 'confirm' };
}

/** Members tab (Screen 5): roster with roles, invite picker, pending invites, remove/transfer/leave. */
export function MembersPanel({ group, candidates }: { group: GroupDetail; candidates: InviteCandidate[] }) {
  const actions = useMemberActions(group);
  const ownerMustTransfer = group.myRole === 'owner' && group.memberCount > 1;
  const rowActions = (member: RosterMember) => (
    <>
      {group.permissions.canTransfer && !member.isMe && member.status === 'active' && (
        <Button variant="ghost" onClick={() => actions.transfer(member)}>
          Make owner
        </Button>
      )}
      {canRemoveMember(group, member) && (
        <Button variant="ghost" className="text-danger!" onClick={() => actions.remove(member)}>
          {member.status === 'invited' ? 'Cancel' : 'Remove'}
        </Button>
      )}
    </>
  );
  return (
    <div className="flex flex-col gap-3">
      {group.permissions.canInvite && <InvitePicker groupId={group.id} candidates={candidates} />}
      <Card as="section" aria-labelledby="roster-heading">
        <h2 id="roster-heading" className="text-[length:var(--text-md)]">
          Members · {group.memberCount}
        </h2>
        <ul className="mt-1 divide-y divide-border-subtle">{group.members.map((m) => <MemberRow key={m.user.id} member={m} actions={rowActions(m)} />)}</ul>
        {group.invited.length > 0 && (
          <>
            <h3 className="mt-4 text-[length:var(--text-sm)] text-text-2">Invited</h3>
            <ul className="divide-y divide-border-subtle">{group.invited.map((m) => <MemberRow key={m.user.id} member={m} actions={rowActions(m)} />)}</ul>
          </>
        )}
        {group.permissions.canLeave && (
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle pt-3">
            {ownerMustTransfer && <span className="text-[length:var(--text-sm)] text-text-2">Make someone else the owner before you leave.</span>}
            <Button variant="secondary" disabled={ownerMustTransfer} onClick={actions.leave}>
              Leave group
            </Button>
          </div>
        )}
      </Card>
      <ConfirmSheet confirmation={actions.confirmation} isPending={actions.isPending} onClose={actions.close} />
    </div>
  );
}
