import { ChevronRight, Compass, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/core';
import { AvatarStack, Card, EmptyState } from '@/features/core/components/ui';
import { listPublicGroups } from '@/features/groups/server/summaries';
import { createServerClient } from '@/lib/supabase/server';
import { chipLabel } from '@/shared/labels';

export const metadata = { title: 'Discover groups' };

/** P1 public group discovery: largest first; joining happens through a member's invite. */
export default async function DiscoverGroupsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const groups = await listPublicGroups({ userId: user.id, supabase: await createServerClient() });
  return (
    <div className="flex flex-col gap-4">
      <header>
        <Link href="/groups" className="text-[length:var(--text-sm)] font-semibold">
          ← Your groups
        </Link>
        <h1 className="mt-2">Public groups</h1>
        <p className="mt-1 text-[length:var(--text-sm)] text-text-2">Open groups near you. Any member can invite you in.</p>
      </header>
      <Card as="section" aria-label="Public groups">
        {groups.length === 0 ? (
          <EmptyState icon={<Compass size={22} strokeWidth={1.75} aria-hidden />} title="No public groups yet. Start one from Groups." />
        ) : (
          <ul className="feed-stagger flex flex-col">
            {groups.map((group) => (
              <li key={group.id}>
                <Link href={`/groups/${group.id}`} className="flex min-h-[72px] items-center gap-3 rounded-md px-2 py-3 text-text hover:bg-hover hover:no-underline">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                    <UsersRound size={20} strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{group.name}</span>
                    {group.description && <span className="block truncate text-[length:var(--text-sm)] text-text-2">{group.description}</span>}
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[length:var(--text-sm)] text-text-2">
                      <AvatarStack people={group.memberPreview.map((p) => ({ name: p.displayName, src: p.avatarUrl }))} max={4} size={32} />
                      {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                      {group.interests.length > 0 && <span className="truncate">· {group.interests.slice(0, 3).map(chipLabel).join(', ')}</span>}
                      {group.myStatus === 'active' && <span className="font-semibold text-brand">· You’re a member</span>}
                    </span>
                  </span>
                  <ChevronRight size={20} className="shrink-0 text-text-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
