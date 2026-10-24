import type { ProposalDocument } from '@/shared/types';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '../../format';
import type { RejectionReason } from '../../schemas';
import { centsToPrice, priceToCents, type EventDraft } from '../EventFieldset';

/**
 * The pure half of the decision panel: what the editor starts from, and the exact body
 * `PATCH /api/business/proposals/:id` receives. Kept out of the component so the Scene 4
 * payload is unit-tested (spec section 5).
 */

export const REASON_LABEL: Record<RejectionReason, string> = {
  wrong_time: 'The suggested time does not work',
  no_capacity: 'We cannot host that many people',
  not_our_thing: 'Not the kind of event we run',
  price_too_low: 'The price is too low for us',
  staffing: 'We cannot staff it',
  other: 'Another reason',
};

export type DecisionMode = 'idle' | 'editing' | 'rejecting';

const MINUTE_MS = 60_000;

/** The proposal's own suggestion, as the editor's starting values. */
export function initialEventDraft(
  document: ProposalDocument,
  suggestedStartsAt: string,
): EventDraft {
  const endsAt = new Date(
    new Date(suggestedStartsAt).getTime() + document.estimatedDurationMinutes * MINUTE_MS,
  ).toISOString();

  return {
    title: document.title,
    description: document.description,
    category: document.category,
    format: document.format,
    startsAtLocal: toDateTimeLocalValue(suggestedStartsAt),
    endsAtLocal: toDateTimeLocalValue(endsAt),
    capacity: document.suggestedCapacity,
    priceDollars: centsToPrice(document.suggestedPriceCents),
  };
}

export const approveBody = (publish: boolean) => ({ decision: 'approve' as const, publish });

export const modifyBody = (draft: EventDraft, publish: boolean) => ({
  decision: 'modify' as const,
  publish,
  edits: {
    title: draft.title,
    description: draft.description,
    format: draft.format,
    startsAt: fromDateTimeLocalValue(draft.startsAtLocal),
    endsAt: fromDateTimeLocalValue(draft.endsAtLocal),
    capacity: draft.capacity,
    priceCents: priceToCents(draft.priceDollars),
  },
});

export const rejectBody = (reason: RejectionReason, note: string) => ({
  decision: 'reject' as const,
  reason,
  ...(note.trim() === '' ? {} : { note: note.trim() }),
});
