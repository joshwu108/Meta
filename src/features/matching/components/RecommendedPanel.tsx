'use client';
import { EyeOff, MapPin, UsersRound, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, EmptyState } from '@/features/core/components/ui';
import type { MatchCard, MatchesStatus } from '../server/matches';
import { MatchCardView } from './MatchCardView';
import { MatchFilters, type MatchFilterState } from './MatchFilters';

const linkButton =
  'inline-flex h-9 items-center justify-center rounded-md bg-brand px-4 font-semibold text-text-on-brand hover:bg-brand-hover hover:no-underline';

type Empty = { icon: LucideIcon; title: string; href: string; cta: string };

const EMPTY: Record<Exclude<MatchesStatus, 'ok'>, Empty> = {
  not_discoverable: { icon: EyeOff, title: 'Turn on matching in your agent permissions to see people near you.', href: '/agent/permissions', cta: 'Open permissions' },
  no_location: { icon: MapPin, title: 'Add your neighborhood so your agent can find people nearby.', href: '/agent/preferences', cta: 'Add your neighborhood' },
  no_candidates: { icon: UsersRound, title: 'No one nearby matches yet. Widening your travel radius usually helps.', href: '/agent/preferences', cta: 'Widen your radius' },
};

const NO_FILTER_MATCHES: Empty = { ...EMPTY.no_candidates, title: 'No matches for this filter.', href: '/match', cta: 'Clear filters' };

function EmptyMatches({ status, filtered }: { status: Exclude<MatchesStatus, 'ok'>; filtered: boolean }) {
  const empty = filtered && status === 'no_candidates' ? NO_FILTER_MATCHES : EMPTY[status];
  const Icon = empty.icon;
  return (
    <Card>
      <EmptyState
        icon={<Icon size={22} strokeWidth={1.75} aria-hidden />}
        title={empty.title}
        action={
          <Link href={empty.href} className={linkButton}>
            {empty.cta}
          </Link>
        }
      />
    </Card>
  );
}

type Props = {
  status: MatchesStatus;
  matches: MatchCard[];
  filters: MatchFilterState;
  /** The first card came from an agent deep link (`?focus=`). */
  isFocused: boolean;
  actionsFor: (match: MatchCard) => ReactNode;
};

/** Recommended tab: filters, then the lead match and compact rows, or the right empty state. */
export function RecommendedPanel({ status, matches, filters, isFocused, actionsFor }: Props) {
  if (status !== 'ok' || matches.length === 0) {
    return (
      <>
        {status === 'ok' && <MatchFilters filters={filters} />}
        <EmptyMatches status={status === 'ok' ? 'no_candidates' : status} filtered={Boolean(filters.interest || filters.goal)} />
      </>
    );
  }
  return (
    <>
      <MatchFilters filters={filters} />
      <ol className="feed-stagger flex flex-col gap-3" aria-label="Recommended people">
        {matches.map((match, index) => (
          <li key={match.user.id}>
            <MatchCardView
              match={match}
              variant={index === 0 ? 'lead' : 'compact'}
              actions={actionsFor(match)}
              leadLabel={isFocused ? 'Suggested by your agent' : undefined}
            />
          </li>
        ))}
      </ol>
    </>
  );
}
