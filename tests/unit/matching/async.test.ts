import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const notify = vi.fn();
vi.mock('@/features/core', () => ({ notify: (...args: unknown[]) => notify(...args) }));

const { chunk, mapLimit, notifySafely } = await import('@/features/matching/server/async');

describe('mapLimit', () => {
  it('keeps input order and never runs more than the limit at once', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([30, 10, 20, 5, 15], 2, async (ms, i) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, ms));
      running -= 1;
      return i * 10;
    });
    expect(out).toEqual([0, 10, 20, 30, 40]);
    expect(peak).toBe(2);
  });

  it('handles empty input and limits above the item count', async () => {
    expect(await mapLimit([], 5, async () => 1)).toEqual([]);
    expect(await mapLimit([1, 2], 10, async (n) => n * 2)).toEqual([2, 4]);
  });
});

describe('chunk', () => {
  it('splits into fixed-size batches', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('notifySafely', () => {
  it('passes through and swallows failures', async () => {
    notify.mockResolvedValueOnce(undefined);
    await notifySafely('u1', 'connection_request', { title: 'x' });
    expect(notify).toHaveBeenCalledWith('u1', 'connection_request', { title: 'x' });
    notify.mockRejectedValueOnce(new Error('db down'));
    await expect(notifySafely('u1', 'group_invite', {})).resolves.toBeUndefined();
  });
});
