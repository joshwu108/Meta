import { describe, expect, it } from 'vitest';
import { ApiError, createRateLimiter } from '@/lib/api';

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('createRateLimiter', () => {
  it('allows up to the limit within a window and reports remaining', () => {
    const c = clock();
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: c.now });
    expect(limiter.hit('u1')).toEqual({ allowed: true, remaining: 2, retryAfterMs: 0 });
    expect(limiter.hit('u1').remaining).toBe(1);
    expect(limiter.hit('u1').remaining).toBe(0);
    const blocked = limiter.hit('u1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(1000);
  });

  it('slides the window so old hits expire', () => {
    const c = clock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: c.now });
    limiter.hit('u1');
    c.advance(600);
    limiter.hit('u1');
    expect(limiter.hit('u1').allowed).toBe(false);
    c.advance(401);
    expect(limiter.hit('u1')).toMatchObject({ allowed: true, remaining: 0 });
  });

  it('keys are independent and reset clears one or all', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.hit('a').allowed).toBe(true);
    expect(limiter.hit('b').allowed).toBe(true);
    expect(limiter.hit('a').allowed).toBe(false);
    limiter.reset('a');
    expect(limiter.hit('a').allowed).toBe(true);
    limiter.reset();
    expect(limiter.hit('b').allowed).toBe(true);
  });

  it('assert throws RATE_LIMITED with retry details', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 5000, now: () => 0 });
    limiter.assert('u');
    expect(() => limiter.assert('u')).toThrowError(ApiError);
    try {
      limiter.assert('u');
    } catch (error) {
      const apiError = error as ApiError;
      expect(apiError.code).toBe('RATE_LIMITED');
      expect(apiError.status).toBe(429);
      expect(apiError.message).toContain('5s');
      expect(apiError.details).toEqual({ retryAfterMs: 5000 });
    }
  });
});
