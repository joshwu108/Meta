import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Database } from '@/lib/supabase/database.types';
import { NOTIFICATION_TYPE, EVENT_STATUS } from '@/shared/enums';
import { agentActionLogRowSchema, notificationRowSchema, profileRowSchema, profileUpdateSchema, signupSchema } from '@/shared/schemas';
import type { AgentActionLogRow, NotificationRow, ProfileRow } from '@/shared/schemas';

type Tables = Database['public']['Tables'];

describe('Zod row schemas match generated DB row types', () => {
  it('profiles', () => {
    expectTypeOf<ProfileRow>().toMatchTypeOf<Omit<Tables['profiles']['Row'], 'coarse_lat' | 'coarse_lng'> & { coarse_lat: number | null; coarse_lng: number | null }>();
    expectTypeOf<keyof ProfileRow>().toEqualTypeOf<keyof Tables['profiles']['Row']>();
  });
  it('notifications', () => {
    expectTypeOf<keyof NotificationRow>().toEqualTypeOf<keyof Tables['notifications']['Row']>();
    expectTypeOf<NotificationRow['user_id']>().toEqualTypeOf<Tables['notifications']['Row']['user_id']>();
  });
  it('agent_action_log', () => {
    expectTypeOf<keyof AgentActionLogRow>().toEqualTypeOf<keyof Tables['agent_action_log']['Row']>();
  });
});

describe('row schema runtime parsing', () => {
  const now = new Date().toISOString();
  it('accepts a valid profile row and rejects a long display name', () => {
    const row = { id: crypto.randomUUID(), display_name: 'Maya', avatar_url: null, bio: null, neighborhood: 'Mission', coarse_lat: 37.76, coarse_lng: -122.42, is_discoverable: true, is_adult_confirmed: true, onboarding_completed_at: null, created_at: now, updated_at: now };
    expect(profileRowSchema.safeParse(row).success).toBe(true);
    expect(profileRowSchema.safeParse({ ...row, display_name: 'x'.repeat(61) }).success).toBe(false);
  });
  it('notification type must be a known enum value', () => {
    const base = { id: crypto.randomUUID(), user_id: crypto.randomUUID(), payload: {}, read_at: null, created_at: now };
    for (const type of NOTIFICATION_TYPE) expect(notificationRowSchema.safeParse({ ...base, type }).success).toBe(true);
    expect(notificationRowSchema.safeParse({ ...base, type: 'spam' }).success).toBe(false);
  });
  it('agent log actor must be known', () => {
    const base = { id: crypto.randomUUID(), user_id: null, action: 'x', permissions_used: [], result: 'ok', metadata: {}, created_at: now };
    expect(agentActionLogRowSchema.safeParse({ ...base, actor: 'demand_engine' }).success).toBe(true);
    expect(agentActionLogRowSchema.safeParse({ ...base, actor: 'hacker' }).success).toBe(false);
  });
});

describe('request schemas', () => {
  it('profileUpdateSchema rejects empty bodies, unknown keys and un-confirming adulthood', () => {
    expect(profileUpdateSchema.safeParse({}).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ id: 'x' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ is_adult_confirmed: false }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ bio: ' hi ' }).success).toBe(true);
  });
  it('profileUpdateSchema rounds coarse coordinates to 2 dp', () => {
    const parsed = profileUpdateSchema.parse({ coarse_lat: 37.7612345, coarse_lng: -122.419999 });
    expect(parsed.coarse_lat).toBe(37.76);
    expect(parsed.coarse_lng).toBe(-122.42);
  });
  it('signupSchema requires the adult confirmation literal and defaults to consumer', () => {
    const ok = signupSchema.safeParse({ email: 'a@b.co', password: 'longenough', display_name: 'A', is_adult_confirmed: true });
    expect(ok.success && ok.data.as).toBe('consumer');
    const bad = signupSchema.safeParse({ email: 'a@b.co', password: 'longenough', display_name: 'A' });
    expect(bad.success).toBe(false);
  });
  it('enum arrays are unique', () => {
    expect(new Set(EVENT_STATUS).size).toBe(EVENT_STATUS.length);
    expect(new Set(NOTIFICATION_TYPE).size).toBe(NOTIFICATION_TYPE.length);
  });
});
