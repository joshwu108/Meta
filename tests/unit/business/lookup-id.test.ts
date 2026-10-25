import { describe, expect, it } from 'vitest';
import { isLookupId } from '@/features/business/server/lookup-id';

/**
 * Ids arrive from the URL, which is the boundary where they get checked — the same place
 * the API routes already validate them (they answer 400 VALIDATION for a bad id).
 *
 * Found by opening `/business/events/not-a-uuid/edit` as a signed-in owner: every other
 * unknown id rendered "We could not find that", but a malformed one rendered the error
 * screen, because the value reached Postgres, which rejects it with 22P02 before any
 * ownership check runs. The pages now answer not-found for a shape that cannot match a row.
 */

describe('isLookupId', () => {
  it('accepts a real row key', () => {
    expect(isLookupId('78a2f48d-9914-406e-b0e7-60995f1e2a84')).toBe(true);
  });

  it.each([
    ['a word', 'not-a-uuid'],
    ['empty', ''],
    ['a truncated uuid', '00000000-0000-0000-0000'],
    ['digits', '12345'],
    ['the string null', 'null'],
    ['a traversal attempt', '../../etc/passwd'],
    ['a uuid with trailing text', '78a2f48d-9914-406e-b0e7-60995f1e2a84x'],
    ['whitespace padding', ' 78a2f48d-9914-406e-b0e7-60995f1e2a84 '],
  ])('rejects %s', (_label, value) => {
    expect(isLookupId(value)).toBe(false);
  });
});
