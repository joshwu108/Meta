import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { runSeedWith } from '../../supabase/seed/runner';
import { SEED_PASSWORD } from '../../supabase/seed/types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;

describe('seed runner', () => {
  it('is idempotent and signs in a seeded consumer and owner', async () => {
    const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const first = await runSeedWith(admin);
    expect(first.consumers).toBe(16);
    expect(first.owners).toBe(3);
    expect(first.notifications).toBeGreaterThan(0);
    const second = await runSeedWith(admin);
    expect(second.removedUsers).toBe(19);
    expect(second.consumers).toBe(16);

    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const consumer = await anon.auth.signInWithPassword({ email: 'maya@commonground.test', password: SEED_PASSWORD });
    expect(consumer.error).toBeNull();
    const { data: profile } = await anon.from('profiles').select('display_name, onboarding_completed_at, is_discoverable').single();
    expect(profile?.display_name).toBe('Maya Chen');
    expect(profile?.onboarding_completed_at).not.toBeNull();
    await anon.auth.signOut();

    const fresh = await anon.auth.signInWithPassword({ email: 'demo.new@commonground.test', password: SEED_PASSWORD });
    expect(fresh.error).toBeNull();
    const { data: newProfile } = await anon.from('profiles').select('onboarding_completed_at').single();
    expect(newProfile?.onboarding_completed_at).toBeNull();
    await anon.auth.signOut();

    const owner = await anon.auth.signInWithPassword({ email: 'owner.kiln-and-cup@commonground.test', password: SEED_PASSWORD });
    expect(owner.error).toBeNull();

    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_discoverable', true);
    expect(count).toBe(14);
  }, 60_000);
});
