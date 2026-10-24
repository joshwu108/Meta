import { ApiError } from './errors';

/**
 * Simple per-key sliding-window guard for AI routes (specs §2: "a simple per-user in-memory
 * guard"). State lives in process memory, so it resets on deploy and is per serverless instance;
 * that is acceptable for the hackathon and documented in README.
 */
export type RateLimitOptions = { limit: number; windowMs: number; now?: () => number };

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterMs: number };

type Window = ReadonlyArray<number>;

export function createRateLimiter(opts: RateLimitOptions) {
  const now = opts.now ?? Date.now;
  const windows = new Map<string, Window>();

  function prune(key: string, at: number): Window {
    const kept = (windows.get(key) ?? []).filter((stamp) => at - stamp < opts.windowMs);
    if (kept.length === 0) windows.delete(key);
    else windows.set(key, kept);
    return kept;
  }

  /** Record a hit for `key` and report whether it is within the limit. */
  function hit(key: string): RateLimitResult {
    const at = now();
    const recent = prune(key, at);
    if (recent.length >= opts.limit) {
      const oldest = recent[0] ?? at;
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, opts.windowMs - (at - oldest)) };
    }
    windows.set(key, [...recent, at]);
    return { allowed: true, remaining: opts.limit - recent.length - 1, retryAfterMs: 0 };
  }

  /** Throw `ApiError('RATE_LIMITED')` when the key is over the limit. */
  function assert(key: string): void {
    const result = hit(key);
    if (result.allowed) return;
    const seconds = Math.ceil(result.retryAfterMs / 1000);
    throw new ApiError('RATE_LIMITED', `Too many requests. Try again in ${seconds}s`, 429, { retryAfterMs: result.retryAfterMs });
  }

  function reset(key?: string): void {
    if (key === undefined) windows.clear();
    else windows.delete(key);
  }

  return { hit, assert, reset };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

/** Shared guard for AI-backed routes: 20 calls per user per minute. */
export const aiRateLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
