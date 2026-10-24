import { CalendarClock, ChevronDown, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { AiTag, Avatar, Card, Chip } from '@/features/core/components/ui';
import { SLOT_LABELS, chipLabel, isCategory } from '@/shared/labels';
import type { MatchCard } from '../server/matches';
import { BreakdownBars } from './BreakdownBars';
import { ScoreRing } from './ScoreRing';

/** Shared tags when there are any (their categories are implied), otherwise shared categories. */
function chipValues(match: MatchCard, max: number): string[] {
  const tags = match.sharedInterests.filter((value) => !isCategory(value));
  return (tags.length > 0 ? tags : match.sharedInterests).slice(0, max);
}

function SharedChips({ match, max }: { match: MatchCard; max: number }) {
  const values = chipValues(match, max);
  const slots = match.sharedSlots.slice(0, 1);
  if (values.length === 0 && slots.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="What you share">
      {values.map((value) => (
        <li key={value}>
          <Chip selected>{chipLabel(value)}</Chip>
        </li>
      ))}
      {slots.map((slot) => (
        <li key={slot}>
          <Chip>
            <CalendarClock size={14} strokeWidth={1.75} aria-hidden />
            {SLOT_LABELS[slot]}
          </Chip>
        </li>
      ))}
    </ul>
  );
}

function WhyThisMatch({ match, open }: { match: MatchCard; open?: boolean }) {
  return (
    <details className="group w-full min-w-0" open={open}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm py-1 text-[length:var(--text-sm)] font-semibold text-text-2 hover:text-text [&::-webkit-details-marker]:hidden">
        Why this match?
        <ChevronDown size={16} aria-hidden className="transition-transform duration-[var(--duration-fast)] group-open:rotate-180" />
      </summary>
      <div className="mt-2 rounded-md bg-surface-2 p-3">
        <BreakdownBars breakdown={match.breakdown} />
      </div>
    </details>
  );
}

function Place({ neighborhood }: { neighborhood: string | null }) {
  if (!neighborhood) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[length:var(--text-sm)] text-text-2">
      <MapPin size={14} strokeWidth={1.75} aria-hidden />
      {neighborhood}
    </span>
  );
}

/** The page's lead element: top match with bio, chips, explanation and the breakdown open. */
function LeadMatch({ match, actions }: { match: MatchCard; actions: ReactNode }) {
  return (
    <Card as="article" className="flex flex-col gap-3 sm:p-5" aria-label={`Top match: ${match.user.displayName}, compatibility ${match.score}`}>
      <p className="text-[length:var(--text-sm)] font-semibold text-brand">Top match</p>
      <div className="flex items-start gap-3">
        <Avatar name={match.user.displayName} src={match.user.avatarUrl} size={56} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[length:var(--text-xl)] font-bold">{match.user.displayName}</h2>
          <Place neighborhood={match.user.neighborhood} />
        </div>
        <ScoreRing score={match.score} size={56} />
      </div>
      {match.user.bio && <p className="line-clamp-2 text-text-2">{match.user.bio}</p>}
      <SharedChips match={match} max={5} />
      <div className="flex flex-col items-start gap-1.5">
        <AiTag />
        <p>{match.explanation}</p>
      </div>
      <WhyThisMatch match={match} open />
      <div className="flex items-center justify-end gap-2">{actions}</div>
    </Card>
  );
}

/** Supporting match: one dense row plus the explanation; the breakdown stays collapsed. */
function CompactMatch({ match, actions }: { match: MatchCard; actions: ReactNode }) {
  return (
    <Card as="article" className="flex flex-col gap-2 py-3" aria-label={`${match.user.displayName}, compatibility ${match.score}`}>
      <div className="flex items-start gap-3">
        <Avatar name={match.user.displayName} src={match.user.avatarUrl} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="truncate">{match.user.displayName}</h3>
            <Place neighborhood={match.user.neighborhood} />
          </div>
          <p className="mt-1 text-[length:var(--text-sm)]">
            <AiTag className="mr-1.5 align-middle" />
            {match.explanation}
          </p>
        </div>
        <ScoreRing score={match.score} size={40} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 sm:pl-[52px]">
        <div className="min-w-0 flex-1">
          <SharedChips match={match} max={3} />
        </div>
        <div className="ml-auto flex items-center gap-1">{actions}</div>
      </div>
      <div className="sm:pl-[52px]">
        <WhyThisMatch match={match} />
      </div>
    </Card>
  );
}

/** One recommended person (Screen 3). Actions (Connect, overflow menu) come from the screen. */
export function MatchCardView({ match, variant, actions }: { match: MatchCard; variant: 'lead' | 'compact'; actions: ReactNode }) {
  return variant === 'lead' ? <LeadMatch match={match} actions={actions} /> : <CompactMatch match={match} actions={actions} />;
}
