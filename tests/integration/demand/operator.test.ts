import { afterAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, cleanupTestUsers, createTestUser } from '../helpers';

const admin = adminClient();
const db = (client: unknown) => client as SupabaseClient;

afterAll(async () => {
  await cleanupTestUsers(admin);
});

describe('profiles.is_operator (0402)', () => {
  it('defaults to false and cannot be self-granted', async () => {
    const user = await createTestUser(admin, 'operator');
    const { data } = await db(user.client).from('profiles').select('is_operator').eq('id', user.id).single();
    expect(data?.is_operator).toBe(false);
    const { error } = await db(user.client).from('profiles').update({ is_operator: true }).eq('id', user.id);
    expect(error?.message).toMatch(/service role/);
  });

  it('can be granted by the service role', async () => {
    const user = await createTestUser(admin, 'operator2');
    const { error } = await db(admin).from('profiles').update({ is_operator: true }).eq('id', user.id);
    expect(error).toBeNull();
    const { data } = await db(user.client).from('profiles').select('is_operator').eq('id', user.id).single();
    expect(data?.is_operator).toBe(true);
  });
});
