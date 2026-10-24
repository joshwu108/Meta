'use client';
import { CalendarClock, MapPinned, ThumbsUp, Wallet } from 'lucide-react';
import Link from 'next/link';
import { AiTag, Button, Card, Chip, cn } from '@/features/core/components/ui';
import { CATEGORY_LABELS, SLOT_PHRASES } from '@/shared/labels';
import type { PlanSuggestion } from '@/shared/schemas/social';
import { formatCost } from '../labels';

type Props = {
  suggestion: PlanSuggestion;
  votes: number;
  votedByMe: boolean;
  canVote: boolean;
  venueEligible: boolean;
  isVoting: boolean;
  isRequesting: boolean;
  onVote: () => void;
  onRequestVenue: () => void;
};

const linkButton = 'inline-flex h-9 items-center justify-center rounded-md bg-brand px-4 font-semibold text-text-on-brand hover:bg-brand-hover hover:no-underline';

function Facts({ suggestion }: { suggestion: PlanSuggestion }) {
  const cost = formatCost(suggestion.estimatedCostCents);
  const place = suggestion.kind === 'existing_event' ? 'Already on the calendar' : suggestion.needsVenue ? 'Needs a venue' : 'No venue needed';
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--text-sm)] text-text-2">
      <li className="inline-flex items-center gap-1">
        <CalendarClock size={14} strokeWidth={1.75} aria-hidden /> {SLOT_PHRASES[suggestion.slot]}
      </li>
      {cost && (
        <li className="inline-flex items-center gap-1">
          <Wallet size={14} strokeWidth={1.75} aria-hidden /> {suggestion.kind === 'existing_event' ? cost : `About ${cost}`}
        </li>
      )}
      <li className="inline-flex items-center gap-1">
        <MapPinned size={14} strokeWidth={1.75} aria-hidden /> {place}
      </li>
    </ul>
  );
}

/** One planner suggestion (Screen 5): AI-marked, votable, with RSVP or "Request venue". */
export function SuggestionCard({ suggestion, votes, votedByMe, canVote, venueEligible, isVoting, isRequesting, onVote, onRequestVenue }: Props) {
  return (
    <Card as="article" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <AiTag />
        <Chip>{CATEGORY_LABELS[suggestion.category]}</Chip>
      </div>
      <h3>{suggestion.title}</h3>
      {suggestion.description && <p className="text-text-2">{suggestion.description}</p>}
      <Facts suggestion={suggestion} />
      <p className="text-[length:var(--text-sm)]">
        <span className="font-semibold">Why it fits: </span>
        {suggestion.whyItFits}
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <Button
          variant={votedByMe ? 'secondary' : 'ghost'}
          aria-pressed={votedByMe}
          disabled={!canVote}
          isLoading={isVoting}
          onClick={onVote}
          leadingIcon={<ThumbsUp size={16} aria-hidden className={cn(votedByMe && 'text-brand')} />}
        >
          {votes} {votes === 1 ? 'vote' : 'votes'}
        </Button>
        {suggestion.kind === 'existing_event' && suggestion.eventId ? (
          <Link href={`/events/${suggestion.eventId}`} className={linkButton}>
            View & RSVP
          </Link>
        ) : suggestion.needsVenue ? (
          <span className="flex flex-col items-end gap-0.5">
            <Button variant="secondary" disabled={!venueEligible} isLoading={isRequesting} onClick={onRequestVenue}>
              Request venue
            </Button>
            {!venueEligible && <span className="text-[length:var(--text-xs)] text-text-3">Needs votes from half the group</span>}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
