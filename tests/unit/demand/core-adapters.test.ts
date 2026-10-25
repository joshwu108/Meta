import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionLogEntry } from '@/features/demand/server/deps';

vi.mock('server-only', () => ({}));
const notify = vi.fn();
const logAgentAction = vi.fn(async () => undefined);
vi.mock('@/features/core', () => ({ notify, logAgentAction }));

const { logActions, notifyOwner } = await import('@/features/demand/server/core-adapters');

describe('core adapters (01 contracts)', () => {
  beforeEach(() => {
    notify.mockReset();
    logAgentAction.mockClear();
  });

  it('passes notifications through to 01', async () => {
    notify.mockResolvedValue(undefined);
    await notifyOwner('owner-1', 'proposal_received', { proposalId: 'p1' });
    expect(notify).toHaveBeenCalledWith('owner-1', 'proposal_received', { proposalId: 'p1' });
  });

  it('never lets a failed notification fail the run', async () => {
    notify.mockRejectedValue(new Error('db down'));
    await expect(notifyOwner('owner-1', 'proposal_received', {})).resolves.toBeUndefined();
  });

  it('writes one audit row per entry through logAgentAction, in bounded batches', async () => {
    const entries: ActionLogEntry[] = Array.from({ length: 60 }, (_, i) => ({
      userId: `u${i}`, actor: 'demand_engine', action: 'collect_signals', permissionsUsed: ['demand'], result: 'included',
    }));
    await logActions(entries);
    expect(logAgentAction).toHaveBeenCalledTimes(60);
    expect(logAgentAction).toHaveBeenCalledWith({ userId: 'u0', actor: 'demand_engine', action: 'collect_signals', permissionsUsed: ['demand'], result: 'included' });
    await logActions([]);
    expect(logAgentAction).toHaveBeenCalledTimes(60);
  });
});
