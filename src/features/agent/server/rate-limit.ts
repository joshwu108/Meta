/**
 * In-memory sliding-window limiter (per server instance). Good enough for the
 * MVP's per-user guard on AI routes; not a distributed quota.
 */
export type RateLimiter = { take: (key: string, now?: number) => boolean; reset: () => void };

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  let hits = new Map<string, readonly number[]>();
  return {
    take(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits = new Map(hits).set(key, recent);
        return false;
      }
      hits = new Map(hits).set(key, [...recent, now]);
      return true;
    },
    reset() {
      hits = new Map();
    },
  };
}

/** `POST /api/agent/chat`: 30 calls per 10 minutes per user. */
export const chatLimiter = createRateLimiter(30, 10 * 60 * 1000);
