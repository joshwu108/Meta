import { describe, expect, it } from 'vitest';
import {
  EMPTY_REVISE_FORM,
  MAX_REVISIONS,
  canRevise,
  reviseBody,
  reviseErrorMessage,
} from '@/features/business/components/decision/revise';

/**
 * P1-3. Workstream 04's `ReviseProposalRequest` is `.strict()` and needs at least one
 * field, so an untouched control must be omitted rather than sent empty.
 */
describe('revise request body', () => {
  it('sends nothing for an untouched form', () => {
    expect(reviseBody(EMPTY_REVISE_FORM)).toEqual({});
    expect(canRevise(EMPTY_REVISE_FORM)).toBe(false);
  });

  it('sends only a trimmed note when that is all the owner wrote', () => {
    expect(reviseBody({ ...EMPTY_REVISE_FORM, note: '  make it cheaper  ' })).toEqual({
      note: 'make it cheaper',
    });
  });

  it('omits a note that is only whitespace', () => {
    expect(reviseBody({ ...EMPTY_REVISE_FORM, note: '   ' })).toEqual({});
  });

  it('converts the price to cents and the capacity to a number', () => {
    expect(reviseBody({ ...EMPTY_REVISE_FORM, priceDollars: '25', capacity: '10' })).toEqual({
      priceCents: 2500,
      capacity: 10,
    });
  });

  it('keeps a free revision distinct from an untouched price', () => {
    expect(reviseBody({ ...EMPTY_REVISE_FORM, priceDollars: '0' })).toEqual({ priceCents: 0 });
    expect(reviseBody({ ...EMPTY_REVISE_FORM, priceDollars: '' })).toEqual({});
  });

  it('passes a slot through and omits the empty choice', () => {
    expect(reviseBody({ ...EMPTY_REVISE_FORM, slot: 'sat_day' })).toEqual({ slot: 'sat_day' });
    expect(reviseBody({ ...EMPTY_REVISE_FORM, slot: '' })).toEqual({});
  });

  it('never emits an undefined value, which the strict schema would reject', () => {
    const body = reviseBody({ note: 'x', priceDollars: '', capacity: '', slot: '' });
    expect(Object.values(body).every((v) => v !== undefined)).toBe(true);
    expect(Object.keys(body)).toEqual(['note']);
  });

  it('is sendable as soon as any one field is set', () => {
    expect(canRevise({ ...EMPTY_REVISE_FORM, note: 'later please' })).toBe(true);
    expect(canRevise({ ...EMPTY_REVISE_FORM, capacity: '8' })).toBe(true);
    expect(canRevise({ ...EMPTY_REVISE_FORM, slot: 'fri_eve' })).toBe(true);
  });
});

describe('revise error copy', () => {
  it('explains the revision limit rather than repeating the code', () => {
    const message = reviseErrorMessage('CONFLICT', 'nope');
    expect(message).toContain(String(MAX_REVISIONS));
    expect(message).toMatch(/waiting on you/i);
  });

  it('offers the owner a way forward when the AI is unavailable', () => {
    expect(reviseErrorMessage('AI_UNAVAILABLE', 'nope')).toMatch(/approve it with your own edits/i);
  });

  it('is honest when revisions are simply not available', () => {
    expect(reviseErrorMessage('NOT_FOUND', 'nope')).toMatch(/not available/i);
  });

  it('passes a validation message straight through, since 04 wrote it for this field', () => {
    expect(reviseErrorMessage('VALIDATION', 'Capacity can be at most 12')).toBe(
      'Capacity can be at most 12',
    );
  });

  /*
   * This used to assert the server's own text was shown for anything unmapped. That was the
   * hole: the server's INTERNAL text carries a request id, and 04's revise endpoint began
   * returning it for real. Unmapped codes now share the wording every other business form
   * uses; VALIDATION is still passed through, because that text is written for the owner.
   */
  it('uses owner-facing wording for anything unmapped', () => {
    expect(reviseErrorMessage('INTERNAL', 'something went wrong')).not.toBe('something went wrong');
  });

  /**
   * Observed in the running app: 04's revise endpoint 500s around a DST change (see the
   * report in PROGRESS.md), and the server's INTERNAL text is "Something went wrong
   * (request <uuid>)". That fell through `default: return fallback`, so a venue owner was
   * shown a bare request id.
   */
  it('never shows the owner an internal failure or a request id', () => {
    const message = reviseErrorMessage('INTERNAL', 'Something went wrong (request 03f2c426-6aa5-427f-a222-55af01177d09)');

    expect(message).not.toMatch(/request [0-9a-f-]{8}/i);
    expect(message).toMatch(/[.!]$/);
  });

  it('still answers for a code it has no special wording for', () => {
    for (const code of ['FORBIDDEN', 'UNAUTHENTICATED', 'CAPACITY_FULL'] as const) {
      const message = reviseErrorMessage(code, 'raw server text');

      expect(message, code).not.toBe('raw server text');
      expect(message.length, code).toBeGreaterThan(0);
    }
  });
});
