import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The guard in front of every `/business` page. The `(business)` layout redirects too, but
 * these pages are also reachable directly (an owner's bookmark, a link in a notification),
 * so the decision is asserted here rather than assumed.
 */

const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    // next/navigation's redirect throws to unwind the render; mimic that so a caller
    // cannot accidentally continue past it.
    throw new Error(`REDIRECT:${url}`);
  }),
);
const getCurrentUser = vi.hoisted(() => vi.fn());
const getOwnerBusiness = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/features/core', () => ({ getCurrentUser }));
vi.mock('@/lib/supabase/server', () => ({ createServerClient: vi.fn(async () => ({})) }));
vi.mock('@/features/business/server/context', () => ({ businessDeps: vi.fn(() => ({ store: {} })) }));
vi.mock('@/features/business/server/businesses', () => ({ getOwnerBusiness }));

const { requireBusinessPage, requireOnboardingPage } = await import(
  '@/features/business/server/page-data'
);

const OWNER = { id: 'user-1', businessId: 'biz-1' };
const VIEW = { id: 'biz-1', name: 'Kiln & Cup' };

describe('requireBusinessPage', () => {
  beforeEach(() => {
    redirect.mockClear();
    getCurrentUser.mockReset();
    getOwnerBusiness.mockReset();
  });

  it('sends a signed-out visitor to login, carrying where they were going', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requireBusinessPage()).rejects.toThrow('REDIRECT:/login?next=/business');
  });

  it('sends a signed-in account with no business to onboarding', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1', businessId: null });
    getOwnerBusiness.mockResolvedValue(null);
    await expect(requireBusinessPage()).rejects.toThrow('REDIRECT:/business/onboarding');
  });

  it('returns the owner view and a dependency bundle for an owner', async () => {
    getCurrentUser.mockResolvedValue(OWNER);
    getOwnerBusiness.mockResolvedValue(VIEW);

    const ctx = await requireBusinessPage();

    expect(ctx.business).toBe(VIEW);
    expect(ctx.deps).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('looks the business up by the signed-in user, never by a client-supplied id', async () => {
    getCurrentUser.mockResolvedValue(OWNER);
    getOwnerBusiness.mockResolvedValue(VIEW);

    await requireBusinessPage();

    expect(getOwnerBusiness).toHaveBeenCalledTimes(1);
    expect(getOwnerBusiness.mock.calls[0]?.[1]).toBe('user-1');
  });
});

describe('requireOnboardingPage', () => {
  beforeEach(() => {
    redirect.mockClear();
    getCurrentUser.mockReset();
  });

  it('sends a signed-out visitor to login', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requireOnboardingPage()).rejects.toThrow('REDIRECT:/login?next=/business/onboarding');
  });

  it('sends an owner who already has a business to the dashboard', async () => {
    getCurrentUser.mockResolvedValue(OWNER);
    await expect(requireOnboardingPage()).rejects.toThrow('REDIRECT:/business');
  });

  it('lets an account with no business through', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1', businessId: null });
    await expect(requireOnboardingPage()).resolves.toEqual({ userId: 'user-1' });
    expect(redirect).not.toHaveBeenCalled();
  });
});
