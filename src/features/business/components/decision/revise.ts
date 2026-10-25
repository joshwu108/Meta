import type { AvailabilitySlot } from '@/shared/enums';
import type { ErrorCode } from '@/lib/api';
import { priceToCents } from '../event-draft';
import { submitErrorMessage } from '../submit-error';

/**
 * "Ask AI to revise" (spec §3, P1). Workstream 04 owns the endpoint:
 * `POST /api/ai/proposals/:id/revise` takes `{ note?, priceCents?, capacity?, slot? }`,
 * needs at least one of them, and answers 201 with a **new pending proposal** that
 * supersedes this one — so the owner is sent to the new proposal, not back to this page.
 *
 * Kept pure so the request body and the owner-facing copy are unit-tested without a browser.
 */

/** 04 enforces this in `0403` as a check constraint and rejects the fourth with CONFLICT. */
export const MAX_REVISIONS = 3;

export type ReviseForm = {
  note: string;
  priceDollars: string;
  capacity: string;
  slot: AvailabilitySlot | '';
};

export const EMPTY_REVISE_FORM: ReviseForm = { note: '', priceDollars: '', capacity: '', slot: '' };

export type ReviseBody = {
  note?: string;
  priceCents?: number;
  capacity?: number;
  slot?: AvailabilitySlot;
};

export type ReviseResponse = {
  proposalId: string;
  supersedes: string;
  revision: number;
  proposal: unknown;
};

/** The schema is `.strict()`, so an untouched field must be omitted, not sent as empty. */
export function reviseBody(form: ReviseForm): ReviseBody {
  const note = form.note.trim();
  const price = priceToCents(form.priceDollars);
  const capacity = form.capacity.trim() === '' ? null : Number(form.capacity);

  return {
    ...(note === '' ? {} : { note }),
    ...(price === null ? {} : { priceCents: price }),
    ...(capacity === null || !Number.isFinite(capacity) ? {} : { capacity }),
    ...(form.slot === '' ? {} : { slot: form.slot }),
  };
}

/** 04 refuses a request with nothing in it; say so before spending a round trip. */
export const canRevise = (form: ReviseForm): boolean => Object.keys(reviseBody(form)).length > 0;

/**
 * Owner-facing copy for what 04 can answer. A `NOT_FOUND` is ambiguous — the proposal may
 * be gone, or the route may not exist yet because 04 has not merged — so it is phrased to
 * be true either way.
 */
export function reviseErrorMessage(code: ErrorCode, fallback: string): string {
  switch (code) {
    case 'CONFLICT':
      return `This proposal cannot be revised again. A proposal can be revised ${MAX_REVISIONS} times, and only while it is still waiting on you.`;
    case 'RATE_LIMITED':
      return 'Too many AI requests just now. Give it a minute and try again.';
    case 'AI_UNAVAILABLE':
      return 'The AI could not rewrite this one. You can still approve it with your own edits, or reject it.';
    case 'NOT_FOUND':
      return 'Revisions are not available for this proposal yet.';
    case 'VALIDATION':
      return fallback;
    default:
      // Everything else shares the wording every other business form uses, rather than
      // falling through to the server's own text: an INTERNAL failure reads "Something went
      // wrong (request <uuid>)", and a venue owner was being shown that request id.
      return submitErrorMessage(code, fallback);
  }
}
