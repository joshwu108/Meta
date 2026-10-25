import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/features/agent/server/rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit inside the window, then blocks", () => {
    const rl = createRateLimiter(3, 1000);
    expect([0, 1, 2, 3].map((t) => rl.take("u", t))).toEqual([true, true, true, false]);
  });

  it("frees capacity as old hits leave the window", () => {
    const rl = createRateLimiter(2, 1000);
    rl.take("u", 0);
    rl.take("u", 500);
    expect(rl.take("u", 999)).toBe(false);
    expect(rl.take("u", 1000)).toBe(true);
  });

  it("tracks users independently", () => {
    const rl = createRateLimiter(1, 1000);
    expect(rl.take("a", 0)).toBe(true);
    expect(rl.take("b", 0)).toBe(true);
    expect(rl.take("a", 1)).toBe(false);
  });

  it("does not count blocked attempts against the window", () => {
    const rl = createRateLimiter(1, 1000);
    rl.take("u", 0);
    rl.take("u", 10);
    rl.take("u", 20);
    expect(rl.take("u", 1000)).toBe(true);
  });

  it("matches the 30 per 10 minutes chat policy", () => {
    const rl = createRateLimiter(30, 600_000);
    const results = Array.from({ length: 31 }, (_, i) => rl.take("u", i));
    expect(results.filter(Boolean)).toHaveLength(30);
    expect(results[30]).toBe(false);
  });
});
