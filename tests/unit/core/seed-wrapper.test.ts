import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ tag: 'admin' })) }));
const runSeedWith = vi.fn(async (_admin: unknown, log: (s: string) => void) => {
  log('step one');
  return { consumers: 1 };
});
vi.mock('../../../supabase/seed/runner', () => ({ runSeedWith }));

const { runSeed } = await import('@/features/core/server/seed');

describe('runSeed', () => {
  it('runs the shared runner with the admin client', async () => {
    await expect(runSeed()).resolves.toEqual({ consumers: 1 });
    expect(runSeedWith).toHaveBeenCalledWith({ tag: 'admin' }, expect.any(Function));
  });
});
