'use client';
import { ArrowLeft, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState, type RefObject } from 'react';
import { AvatarStack, Button, Card, Chip, Tabs } from '@/features/core/components/ui';
import { useFocusFallback } from '@/lib/use-focus-fallback';
import { useUrlTab } from '@/lib/use-url-tab';
import { chipLabel } from '@/shared/labels';
import type { GroupDetail } from '../server/types';
import { ROLE_LABELS } from '../labels';
import { EditGroupSheet } from './EditGroupSheet';
import { EventsPanel } from './EventsPanel';
import { VisibilityBadge } from './GroupsScreen';
import { InvitationButtons } from './InvitationButtons';
import type { InviteCandidate } from './InvitePicker';
import { MembersPanel } from './MembersPanel';
import { PlansPanel } from './PlansPanel';

export type GroupTab = 'plans' | 'events' | 'members';

const GROUP_TABS: readonly GroupTab[] = ['plans', 'events', 'members'];

function GroupHeader({ group, onEdit, editRef }: { group: GroupDetail; onEdit: () => void; editRef: RefObject<HTMLButtonElement | null> }) {
  const people = group.members.map((m) => ({ name: m.user.displayName, src: m.user.avatarUrl }));
  return (
    <Card as="section" aria-label="Group" className="flex flex-col gap-3">
      <Link href="/groups" className="inline-flex w-fit items-center gap-1 text-[length:var(--text-sm)] font-semibold">
        <ArrowLeft size={16} aria-hidden /> Groups
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words">{group.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[length:var(--text-sm)] text-text-2">
            <VisibilityBadge visibility={group.visibility} />
            {group.myRole && group.myStatus === 'active' && <span>You’re {group.myRole === 'member' ? 'a member' : `the ${ROLE_LABELS[group.myRole].toLowerCase()}`}</span>}
          </p>
        </div>
        {group.permissions.canEdit && (
          <Button ref={editRef} variant="secondary" leadingIcon={<Pencil size={16} aria-hidden />} onClick={onEdit}>
            Edit
          </Button>
        )}
      </div>
      {group.description && <p className="text-text-2">{group.description}</p>}
      {group.interests.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Group interests">
          {group.interests.map((tag) => (
            <li key={tag}>
              <Chip>{chipLabel(tag)}</Chip>
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-center gap-2 text-[length:var(--text-sm)] text-text-2">
        <AvatarStack people={people} max={5} size={32} />
        {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
      </p>
    </Card>
  );
}

function InvitedBanner({ group }: { group: GroupDetail }) {
  if (group.myStatus !== 'invited' || !group.invitationId) return null;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-brand">
      <p className="font-semibold">You’re invited to join {group.name}.</p>
      <InvitationButtons invitationId={group.invitationId} groupId={group.id} groupName={group.name} />
    </Card>
  );
}

/** Screen 5 `/groups/:id`: header, then Plans (planner is the lead), Events and Members tabs; `?tab=` picks one. */
export function GroupScreen({ group, candidates }: { group: GroupDetail; candidates: InviteCandidate[] }) {
  const isMember = group.myStatus === 'active';
  const [tab, setTab] = useUrlTab(GROUP_TABS, isMember ? 'plans' : 'members');
  const [isEditing, setIsEditing] = useState(false);
  const editRef = useRef<HTMLButtonElement>(null);
  // 01's Sheet does not return focus yet, so closing puts it back on "Edit".
  const closeEdit = () => {
    setIsEditing(false);
    editRef.current?.focus();
  };
  const items = [
    ...(isMember ? [{ value: 'plans' as const, label: 'Plans' }] : []),
    { value: 'events' as const, label: 'Events', count: group.upcomingEvents.length || undefined },
    { value: 'members' as const, label: 'Members', count: group.memberCount },
  ];
  const active = items.some((item) => item.value === tab) ? tab : items[0]!.value;
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusFallback(panelRef, group.myStatus ?? '');
  return (
    <div className="flex flex-col gap-4">
      <GroupHeader group={group} onEdit={() => setIsEditing(true)} editRef={editRef} />
      <InvitedBanner group={group} />
      <div className="overflow-x-auto">
        <Tabs items={items} value={active} onChange={setTab} ariaLabel="Group sections" />
      </div>
      <div ref={panelRef} tabIndex={-1} role="tabpanel" aria-label={items.find((item) => item.value === active)?.label}>
        {active === 'plans' && <PlansPanel group={group} />}
        {active === 'events' && <EventsPanel events={group.upcomingEvents} />}
        {active === 'members' && <MembersPanel group={group} candidates={candidates} />}
      </div>
      {group.permissions.canEdit && <EditGroupSheet group={group} isOpen={isEditing} onClose={closeEdit} />}
    </div>
  );
}
