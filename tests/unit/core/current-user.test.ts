import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, cache: <T extends (...args: never[]) => unknown>(fn: T) => fn };
});

const getUser = vi.fn();
const from = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createServerClient: vi.fn(async () => ({ auth: { getUser }, from })) }));

const { getCurrentUser } = await import('@/features/core/server/current-user');
const { countUnreadForCurrentUser } = await import('@/features/core/server/unread');

function table(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'order', 'limit']) chain[method] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => result);
  chain.then = (resolve: (value: unknown) => void) => resolve(result);
  return chain;
}

describe('getCurrentUser', () => {
  beforeEach(() => {
    getUser.mockReset();
    from.mockReset();
  });

  it('returns null when signed out', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('returns null when the profile row is missing', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.c' } } });
    from.mockImplementation(() => table({ data: null, error: null }));
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it('returns profile and businessId when the user owns a business', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.c' } } });
    from.mockImplementation((name: string) =>
      name === 'profiles' ? table({ data: { id: 'u1', display_name: 'A' }, error: null }) : table({ data: { id: 'biz-1' }, error: null }),
    );
    await expect(getCurrentUser()).resolves.toEqual({ id: 'u1', email: 'a@b.c', profile: { id: 'u1', display_name: 'A' }, businessId: 'biz-1' });
  });

  it('businessId is null when the businesses table is missing or empty', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockImplementation((name: string) =>
      name === 'profiles' ? table({ data: { id: 'u1' }, error: null }) : table({ data: null, error: { code: '42P01', message: 'missing' } }),
    );
    const user = await getCurrentUser();
    expect(user?.businessId).toBeNull();
    expect(user?.email).toBeNull();
  });
});

describe('countUnreadForCurrentUser', () => {
  beforeEach(() => {
    getUser.mockReset();
    from.mockReset();
  });

  it('is 0 when signed out, the count otherwise, and 0 on failure', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(countUnreadForCurrentUser()).resolves.toBe(0);

    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    from.mockImplementation(() => table({ count: 3, error: null }));
    await expect(countUnreadForCurrentUser()).resolves.toBe(3);

    from.mockImplementation(() => table({ count: null, error: { message: 'boom' } }));
    await expect(countUnreadForCurrentUser()).resolves.toBe(0);
  });
});
