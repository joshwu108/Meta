'use client';
import { ChevronRight, Lock, Plus, Globe, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { AiTag, AvatarStack, Button, Card, EmptyState } from '@/features/core/components/ui';
import { useFocusFallback } from '@/lib/use-focus-fallback';
import { chipLabel } from '@/shared/labels';
import type { GroupSummary } from '../server/types';
import { VISIBILITY_COPY } from '../labels';
import { CreateGroupSheet } from './CreateGroupSheet';
import { InvitationButtons } from './InvitationButtons';

export function VisibilityBadge({ visibility }: { visibility: GroupSummary['visibility'] }) {
  const Icon = visibility === 'private' ? Lock : Globe;
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-pill bg-surface-2 px-2 text-[length:var(--text-xs)] font-semibold text-text-2">
      <Icon size={12} strokeWidth={2} aria-hidden />
      {VISIBILITY_COPY[visibility].label}
    </span>
  );
}

const avatars = (group: GroupSummary) => group.memberPreview.map((card) => ({ name: card.displayName, src: card.avatarUrl }));

function InvitationsCard({ invitations }: { invitations: GroupSummary[] }) {
  return (
    <Card as="section" aria-labelledby="invitations-heading" className="border-l-4 border-brand sm:p-5">
      <h2 id="invitations-heading">You’re invited</h2>
      <ul className="mt-2 divide-y divide-border-subtle">
        {invitations.map((group) => (
          <li key={group.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {group.name} <VisibilityBadge visibility={group.visibility} />
              </p>
              <p className="mt-1 flex items-center gap-2 text-[length:var(--text-sm)] text-text-2">
                <AvatarStack people={avatars(group)} max={4} size={32} />
                {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
              </p>
            </div>
            {group.invitationId && <InvitationButtons invitationId={group.invitationId} groupId={group.id} groupName={group.name} />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function GroupRow({ group }: { group: GroupSummary }) {
  return (
    <li>
      <Link href={`/groups/${group.id}`} className="flex min-h-[72px] items-center gap-3 rounded-md px-2 py-3 text-text hover:bg-hover hover:no-underline">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
          <UsersRound size={20} strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{group.name}</span>
            <VisibilityBadge visibility={group.visibility} />
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-[length:var(--text-sm)] text-text-2">
            <AvatarStack people={avatars(group)} max={4} size={32} />
            {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
            {group.interests.length > 0 && <span className="truncate">· {group.interests.slice(0, 3).map(chipLabel).join(', ')}</span>}
          </span>
          {group.latestPlanTitle && (
            <span className="mt-1.5 flex items-center gap-2 text-[length:var(--text-sm)]">
              <AiTag />
              <span className="truncate">Next plan: {group.latestPlanTitle}</span>
            </span>
          )}
        </span>
        <ChevronRight size={20} className="shrink-0 text-text-3" aria-hidden />
      </Link>
    </li>
  );
}

/** Screen 4 `/groups`: invitations (lead when present), my groups, create group. */
export function GroupsScreen({ groups }: { groups: GroupSummary[] }) {
  const [isCreating, setIsCreating] = useState(false);
  const createRef = useRef<HTMLButtonElement>(null);
  // 01's Sheet does not return focus yet, so closing puts it back on "Create group".
  const closeCreate = () => {
    setIsCreating(false);
    createRef.current?.focus();
  };
  const invitations = groups.filter((group) => group.myStatus === 'invited');
  const mine = groups.filter((group) => group.myStatus === 'active');
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusFallback(headingRef, String(invitations.length));
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 ref={headingRef} tabIndex={-1}>
            Groups
          </h1>
          <p className="mt-1 text-[length:var(--text-sm)] text-text-2">Small circles for the things you like doing together.</p>
        </div>
        <Button ref={createRef} leadingIcon={<Plus size={18} aria-hidden />} onClick={() => setIsCreating(true)}>
          Create group
        </Button>
      </header>
      {invitations.length > 0 && <InvitationsCard invitations={invitations} />}
      <Card as="section" aria-labelledby="mine-heading">
        <div className="flex items-center justify-between gap-2">
          <h2 id="mine-heading" className="text-[length:var(--text-md)]">
            Your groups
          </h2>
          <Link href="/groups/discover" className="text-[length:var(--text-sm)] font-semibold">
            Browse public groups
          </Link>
        </div>
        {mine.length === 0 ? (
          <EmptyState icon={<UsersRound size={22} strokeWidth={1.75} aria-hidden />} title="You’re not in a group yet. Start one with people you’ve matched with." action={<Button onClick={() => setIsCreating(true)}>Create a group</Button>} />
        ) : (
          <ul className="feed-stagger mt-1 flex flex-col">{mine.map((group) => <GroupRow key={group.id} group={group} />)}</ul>
        )}
      </Card>
      <CreateGroupSheet isOpen={isCreating} onClose={closeCreate} />
    </div>
  );
}
