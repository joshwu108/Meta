import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, cleanupTestUsers, createTestUser, type TestUser } from './helpers';

vi.mock('server-only', () => ({}));

const admin = adminClient();
let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  [alice, bob] = await Promise.all([createTestUser(admin, 'alice'), createTestUser(admin, 'bob')]);
});
afterAll(async () => cleanupTestUsers(admin));

describe('profile helpers', () => {
  it('getOwnProfile returns the row and NOT_FOUND for someone else', async () => {
    const { getOwnProfile } = await import('@/features/core/server/profile');
    const row = await getOwnProfile(alice.client, alice.id);
    expect(row.display_name).toBe('Test alice');
    await expect(getOwnProfile(alice.client, bob.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('updateOwnProfile applies a patch, bumps updated_at and enforces DB checks', async () => {
    const { updateOwnProfile } = await import('@/features/core/server/profile');
    const before = await admin.from('profiles').select('updated_at').eq('id', alice.id).single();
    const updated = await updateOwnProfile(alice.client, alice.id, { bio: 'ceramics', neighborhood: 'Mission', coarse_lat: 37.76, coarse_lng: -122.42, is_discoverable: true });
    expect(updated).toMatchObject({ bio: 'ceramics', neighborhood: 'Mission', is_discoverable: true });
    expect(Number(updated.coarse_lat)).toBeCloseTo(37.76);
    expect(new Date(updated.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(before.data!.updated_at).getTime());
    await expect(updateOwnProfile(alice.client, alice.id, { display_name: 'x'.repeat(61) } as never)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(updateOwnProfile(alice.client, bob.id, { bio: 'nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
