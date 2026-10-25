import { describe, expect, it, vi } from 'vitest';
import { recoverFromError } from '@/features/business/components/recover';

/**
 * Business error boundary (spec section 7): "Try again" has to actually recover.
 *
 * `reset()` on its own re-renders the boundary's children against the client router cache,
 * whose entry for the segment is the failed payload — so the same error replays however
 * often the owner clicks. Measured against the running app with the failing read restored
 * and the server proven healthy from a second tab: `reset()` alone stayed broken, and so
 * did `router.refresh()` followed by `reset()`. Only resetting and refetching inside one
 * transition recovers, because React then commits the cleared boundary together with the
 * new payload instead of against the stale one.
 */

const transition = (callback: () => void): void => callback();

describe('recoverFromError', () => {
  it('clears the boundary and refetches inside a single transition', () => {
    const calls: string[] = [];
    const startTransition = vi.fn((cb: () => void) => { calls.push('transition'); cb(); });
    const reset = vi.fn(() => void calls.push('reset'));
    const router = { refresh: vi.fn(() => void calls.push('refresh')) };

    recoverFromError(startTransition, reset, router);

    // One transition, reset before refresh: either half alone leaves the owner stuck.
    expect(calls).toEqual(['transition', 'reset', 'refresh']);
    expect(startTransition).toHaveBeenCalledTimes(1);
  });

  it('still clears the boundary when the refetch throws, so the button is never a dead end', () => {
    const reset = vi.fn();
    const router = { refresh: vi.fn(() => { throw new Error('refresh failed'); }) };

    expect(() => recoverFromError(transition, reset, router)).not.toThrow();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('does nothing outside the transition, so React owns when the work commits', () => {
    const reset = vi.fn();
    const router = { refresh: vi.fn() };
    const startTransition = vi.fn();

    recoverFromError(startTransition, reset, router);

    expect(reset).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
