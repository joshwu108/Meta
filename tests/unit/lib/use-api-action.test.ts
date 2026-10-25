import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/use-api-action';

describe('errorMessage', () => {
  it('shows API error messages as they are', () => {
    expect(errorMessage(new ApiClientError('CONFLICT', 'A request between you already exists'))).toBe('A request between you already exists');
  });

  it('explains a route that is not deployed yet', () => {
    expect(errorMessage(new ApiClientError('INTERNAL', 'The server returned 404'))).toBe('This isn’t available yet.');
  });

  it('falls back for unknown errors', () => {
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong. Try again.');
  });
});
