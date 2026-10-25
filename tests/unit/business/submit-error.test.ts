import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@/lib/api/errors';
import { submitErrorMessage } from '@/features/business/components/submit-error';

/**
 * What a failed mutation says to the owner.
 *
 * Found by publishing the same draft from two tabs: the second one showed
 * "published -> published is not a legal event transition", which is the status machine
 * talking to a developer. Server text is only owner-facing for VALIDATION, where it names
 * the field and the venue's own hours; every other code needs translating here.
 */

const FALLBACK = 'could not publish the event';

describe('submitErrorMessage', () => {
  it('turns a lost race into something an owner can act on', () => {
    const message = submitErrorMessage('CONFLICT', 'published -> published is not a legal event transition');

    expect(message).not.toContain('->');
    expect(message.toLowerCase()).toContain('reload');
  });

  it('keeps the server wording for a validation error, which is written for the owner', () => {
    const detail = 'These details do not fit the venue: it is open 09:00-21:00 on thu.';

    expect(submitErrorMessage('VALIDATION', detail)).toBe(detail);
  });

  it('does not show internal failure text', () => {
    expect(submitErrorMessage('INTERNAL', FALLBACK)).not.toContain('could not publish');
  });

  it('tells the owner to sign in again when the session has gone', () => {
    expect(submitErrorMessage('UNAUTHENTICATED', FALLBACK).toLowerCase()).toContain('log in');
  });

  // VALIDATION is excluded on purpose: it passes the server's own wording through, which is
  // asserted above, so its shape is the server's to get right rather than this mapper's.
  it.each(ERROR_CODES.filter((code) => code !== 'VALIDATION'))(
    'gives %s a sentence with no machine wording',
    (code) => {
    const message = submitErrorMessage(code, FALLBACK);

    expect(message.length).toBeGreaterThan(0);
    expect(message).toMatch(/[.!]$/);
    // No status-machine arrows, no SCREAMING_CASE codes leaking through.
    expect(message).not.toMatch(/->|[A-Z]{2,}_[A-Z]{2,}/);
    },
  );
});
