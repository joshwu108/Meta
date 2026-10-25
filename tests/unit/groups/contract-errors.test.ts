import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// A Supabase client whose every query resolves to a database error, however it is chained.
const failure = { data: null, error: { message: 'connection reset', code: '08006' } };
const query: unknown = new Proxy(() => query, {
  get: (_target, prop) => (prop === 'then' ? (resolve: (value: unknown) => void) => resolve(failure) : () => query),
});
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => query, rpc: () => query }) }));

const { getGroupMemberIds } = await import('@/features/groups/server/contracts');
const { getGroupVenueRequest } = await import('@/features/groups/server/venue-request');
const { getPendingEventInviteeIds } = await import('@/features/groups/server/invitations');
const { getPublicCards } = await import('@/features/matching/server/cards');
const { loadCandidateIds } = await import('@/features/matching/server/candidates');

const GROUP = '3b1d6c1a-9f2e-4c3b-8a7d-5e6f7a8b9c0d';

describe('exported readers on a database failure', () => {
  it('throw INTERNAL instead of answering as if nothing matched', async () => {
    await expect(getGroupMemberIds(GROUP)).rejects.toMatchObject({ code: 'INTERNAL' });
    await expect(getGroupVenueRequest(GROUP, GROUP, 0)).rejects.toMatchObject({ code: 'INTERNAL' });
    await expect(getPendingEventInviteeIds(GROUP, [GROUP])).rejects.toMatchObject({ code: 'INTERNAL' });
    await expect(getPublicCards([GROUP])).rejects.toMatchObject({ code: 'INTERNAL' });
    await expect(loadCandidateIds(GROUP, { lat: 37.76, lng: -122.42 }, 5)).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});
