import { describe, expect, it } from 'vitest';
import { ApiClientError, fieldErrors } from '@/lib/api/client';
import { ApiError, isApiError, statusForCode } from '@/lib/api/errors';

/**
 * How a server-side validation failure becomes an inline message under the right input.
 * Every business form depends on this shape (see `useSubmit`).
 */
describe('field errors from an envelope', () => {
  it('maps the details array the validator produces', () => {
    expect(
      fieldErrors([
        { field: 'capacity', message: 'this venue can host 12 people, not 400' },
        { field: 'startsAt', message: 'the venue is closed on sun' },
      ]),
    ).toEqual({
      capacity: 'this venue can host 12 people, not 400',
      startsAt: 'the venue is closed on sun',
    });
  });

  it('returns nothing for details that are not a field list', () => {
    for (const details of [undefined, null, 'nope', 42, { field: 'capacity' }]) {
      expect(fieldErrors(details)).toEqual({});
    }
  });

  it('skips malformed entries rather than throwing', () => {
    expect(
      fieldErrors([
        { field: 'capacity', message: 'too many' },
        { field: 'startsAt' },
        { message: 'orphan' },
        null,
        'nope',
      ]),
    ).toEqual({ capacity: 'too many' });
  });

  it('keeps the last message when a field appears twice', () => {
    expect(
      fieldErrors([
        { field: 'capacity', message: 'first' },
        { field: 'capacity', message: 'second' },
      ]),
    ).toEqual({ capacity: 'second' });
  });

  it('carries the code and details on the thrown error', () => {
    const err = new ApiClientError('VALIDATION', 'nope', [{ field: 'capacity', message: 'too many' }]);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiClientError');
    expect(err.code).toBe('VALIDATION');
    expect(fieldErrors(err.details)).toEqual({ capacity: 'too many' });
  });
});

describe('server-side error codes', () => {
  it('maps every envelope code to a sensible status', () => {
    expect(statusForCode('UNAUTHENTICATED')).toBe(401);
    expect(statusForCode('FORBIDDEN')).toBe(403);
    expect(statusForCode('NOT_FOUND')).toBe(404);
    expect(statusForCode('VALIDATION')).toBe(422);
    expect(statusForCode('CONFLICT')).toBe(409);
    expect(statusForCode('CAPACITY_FULL')).toBe(409);
    expect(statusForCode('RATE_LIMITED')).toBe(429);
    expect(statusForCode('AI_UNAVAILABLE')).toBe(503);
    expect(statusForCode('INTERNAL')).toBe(500);
  });

  it('lets an explicit status override the default', () => {
    expect(new ApiError('VALIDATION', 'x', 400).status).toBe(400);
    expect(new ApiError('VALIDATION', 'x').status).toBe(422);
  });

  it('recognises its own errors', () => {
    expect(isApiError(new ApiError('CONFLICT', 'x'))).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
    expect(isApiError(null)).toBe(false);
  });
});
