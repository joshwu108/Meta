import { describe, expect, it, vi } from 'vitest';
import {
  makeLogAgentAction,
  makeNotify,
  noopLogAgentAction,
  noopNotify,
} from '@/features/business/server/stubs';

/**
 * The 01 contracts 05 stands in for until workstream 01 merges. A notification must never
 * fail the write it accompanies, so a missing table is logged and swallowed.
 */
describe('notify stub', () => {
  it('writes one notification row per call', async () => {
    const rows: unknown[] = [];
    const notify = makeNotify(() => ({
      insert: async (batch) => {
        rows.push(...batch);
        return { error: null };
      },
    }));

    await notify('user-a', 'event_published', { eventId: 'evt-1' });

    expect(rows).toEqual([
      { user_id: 'user-a', type: 'event_published', payload: { eventId: 'evt-1' } },
    ]);
  });

  it('does nothing when no sink is configured', async () => {
    const notify = makeNotify(() => null);
    await expect(notify('user-a', 'event_updated', {})).resolves.toBeUndefined();
  });

  it('warns but does not throw when the write fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const notify = makeNotify(() => ({
      insert: async () => ({ error: { message: 'relation "notifications" does not exist' } }),
    }));

    await expect(notify('user-a', 'event_cancelled', {})).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('is a no-op in its noop form', async () => {
    await expect(noopNotify('user-a', 'event_published', {})).resolves.toBeUndefined();
    await expect(
      noopLogAgentAction({ userId: 'u', action: 'a', permissionsUsed: [], result: 'r' }),
    ).resolves.toBeUndefined();
  });
});

describe('agent action log stub', () => {
  it('records the action when a sink exists', async () => {
    const rows: { type: string }[] = [];
    const log = makeLogAgentAction(() => ({
      insert: async (batch) => {
        rows.push(...(batch as { type: string }[]));
        return { error: null };
      },
    }));

    await log({ userId: 'biz-1', action: 'publish_event', permissionsUsed: [], result: 'Pottery' });
    expect(rows[0]?.type).toBe('publish_event');
  });

  it('falls back to a console line with no sink', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const log = makeLogAgentAction(() => null);
    await log({ userId: 'biz-1', action: 'publish_event', permissionsUsed: [], result: 'Pottery' });
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });

  it('warns but does not throw when the write fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = makeLogAgentAction(() => ({
      insert: async () => ({ error: { message: 'no such table' } }),
    }));
    await expect(
      log({ userId: 'biz-1', action: 'publish_event', permissionsUsed: [], result: 'x' }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
