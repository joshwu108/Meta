import { describe, expect, it } from 'vitest';
import { adminClient } from './helpers';

/** CI guard (specs §9): every public table created by any workstream must have RLS enabled. */
describe('RLS guard', () => {
  it('no public table lacks row level security', async () => {
    const admin = adminClient();
    const { data, error } = await admin.rpc('tables_without_rls');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('the guard function is not callable by authenticated or anon roles', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await anon.rpc('tables_without_rls');
    expect(error).not.toBeNull();
  });
});
