'use client';
import { Search, UserPlus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Avatar, Button, Card, useToast } from '@/features/core/components/ui';
import type { PublicCard } from '@/features/matching';
import { useApiAction } from '@/lib/api/use-api-action';

export type InviteCandidate = { user: PublicCard; source: 'connection' | 'requested' | 'match' };

const SOURCE_LABELS: Record<InviteCandidate['source'], string> = { connection: 'Connection', requested: 'Request sent', match: 'Match' };
type InviteResult = { invited: string[]; skipped: { alreadyMember: number; blocked: number; unreachable: number } };

const MAX_PER_INVITE = 20;

function summary(result: InviteResult): string {
  const skipped = result.skipped.alreadyMember + result.skipped.blocked + result.skipped.unreachable;
  const invited = `Invited ${result.invited.length} ${result.invited.length === 1 ? 'person' : 'people'}`;
  return skipped > 0 ? `${invited}. ${skipped} couldn’t be invited.` : invited;
}

/** Invite picker (Screen 5 Members): search connections and matches, pick several, invite. */
export function InvitePicker({ groupId, candidates }: { groupId: string; candidates: InviteCandidate[] }) {
  const { toast } = useToast();
  const { run, isPending } = useApiAction(toast);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const searchId = useId();
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter((c) => !q || c.user.displayName.toLowerCase().includes(q) || (c.user.neighborhood ?? '').toLowerCase().includes(q));
  }, [candidates, query]);
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_PER_INVITE) next.add(id);
      return next;
    });
  const invite = async () => {
    const result = await run<InviteResult>('invite', `/api/groups/${groupId}/invite`, { method: 'POST', body: { userIds: [...selected] } }, { success: summary });
    if (result) setSelected(new Set());
  };

  return (
    <Card as="section" aria-labelledby={`${searchId}-heading`} className="flex flex-col gap-3">
      <h2 id={`${searchId}-heading`} className="text-[length:var(--text-md)]">
        Invite people
      </h2>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-3" aria-hidden />
        <label htmlFor={searchId} className="sr-only">
          Search connections and matches
        </label>
        <input id={searchId} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your connections and matches" className="h-10 w-full rounded-pill border border-divider bg-surface-2 pr-3 pl-9 text-text placeholder:text-text-3 focus:border-brand focus:outline-none" />
      </div>
      {visible.length === 0 ? (
        <p className="text-[length:var(--text-sm)] text-text-2">{candidates.length === 0 ? 'Connect with people on Match to invite them here.' : 'Nobody matches that search.'}</p>
      ) : (
        <ul className="flex max-h-72 flex-col overflow-y-auto" aria-label="People you can invite">
          {visible.map(({ user, source }) => (
            <li key={user.id}>
              <label className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-hover">
                <input type="checkbox" checked={selected.has(user.id)} onChange={() => toggle(user.id)} className="h-4 w-4 accent-[var(--color-brand)]" aria-label={`Invite ${user.displayName}`} />
                <Avatar name={user.displayName} src={user.avatarUrl} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{user.displayName}</span>
                  {user.neighborhood && <span className="block truncate text-[length:var(--text-xs)] text-text-2">{user.neighborhood}</span>}
                </span>
                <span className="shrink-0 rounded-pill bg-surface-2 px-2 py-0.5 text-[length:var(--text-xs)] text-text-2">{SOURCE_LABELS[source]}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <Button leadingIcon={<UserPlus size={16} aria-hidden />} disabled={selected.size === 0} isLoading={isPending('invite')} onClick={invite}>
          {selected.size > 0 ? `Invite ${selected.size}` : 'Invite'}
        </Button>
      </div>
    </Card>
  );
}
