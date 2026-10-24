import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, cleanupTestUsers, createTestUser, type TestUser } from './helpers';

const admin = adminClient();
let alice: TestUser;
let bob: TestUser;
let hidden: TestUser;

beforeAll(async () => {
  [alice, bob, hidden] = await Promise.all([createTestUser(admin, 'alice'), createTestUser(admin, 'bob'), createTestUser(admin, 'hidden')]);
  await admin.from('profiles').update({ is_discoverable: true }).in('id', [alice.id, bob.id]);
  await admin.from('profiles').update({ is_discoverable: false }).eq('id', hidden.id);
});

afterAll(async () => {
  await cleanupTestUsers(admin);
});

describe('profiles', () => {
  it('signup creates a profile row from user metadata', async () => {
    const { data } = await admin.from('profiles').select('*').eq('id', alice.id).single();
    expect(data?.display_name).toBe('Test alice');
    expect(data?.is_adult_confirmed).toBe(true);
    expect(data?.onboarding_completed_at).toBeNull();
  });

  it('a user can read and update their own row', async () => {
    const { data: own } = await alice.client.from('profiles').select('id').eq('id', alice.id).maybeSingle();
    expect(own?.id).toBe(alice.id);
    const { data: updated, error } = await alice.client.from('profiles').update({ bio: 'hello' }).eq('id', alice.id).select('bio, updated_at, created_at').single();
    expect(error).toBeNull();
    expect(updated?.bio).toBe('hello');
    expect(new Date(updated!.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(updated!.created_at).getTime());
  });

  it("RLS blocks reading another user's profile row", async () => {
    const { data } = await alice.client.from('profiles').select('*').eq('id', bob.id);
    expect(data).toEqual([]);
    const { data: all } = await alice.client.from('profiles').select('id');
    expect(all?.map((row) => row.id)).toEqual([alice.id]);
  });

  it("RLS blocks updating another user's profile row", async () => {
    const { data } = await alice.client.from('profiles').update({ bio: 'pwned' }).eq('id', bob.id).select();
    expect(data).toEqual([]);
    const { data: check } = await admin.from('profiles').select('bio').eq('id', bob.id).single();
    expect(check?.bio).toBeNull();
  });

  it('profile_public_cards exposes discoverable users with public columns only', async () => {
    const { data, error } = await alice.client.from('profile_public_cards').select('*').in('id', [alice.id, bob.id, hidden.id]);
    expect(error).toBeNull();
    const ids = (data ?? []).map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([alice.id, bob.id]));
    expect(ids).not.toContain(hidden.id);
    expect(Object.keys(data![0]!).sort()).toEqual(['avatar_url', 'bio', 'display_name', 'id', 'neighborhood']);
  });

  it('anonymous clients cannot read profiles or public cards', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const profiles = await anon.from('profiles').select('id');
    expect(profiles.data ?? []).toEqual([]);
    const cards = await anon.from('profile_public_cards').select('id');
    expect(cards.error ?? cards.data).not.toBeNull();
    expect(cards.data ?? []).toEqual([]);
  });

  it('a business owner account (plain authenticated user) cannot read consumer profiles', async () => {
    // Businesses have no policy on profiles; an owner is just another authenticated user.
    const owner = await createTestUser(admin, 'owner', { signup_as: 'business' });
    const { data } = await owner.client.from('profiles').select('id').neq('id', owner.id);
    expect(data).toEqual([]);
  });
});
