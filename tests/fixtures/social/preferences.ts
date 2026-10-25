import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The demo user as Scene 1 (02's live onboarding) leaves them, for 03's tests and demo prep.
 * Seeded users' preferences and consent come from 02's seed (`pnpm db:seed`); never part of it.
 */

type FixtureUser = {
  email: string;
  interests: string[];
  categories: string[];
  slots: string[];
  goals: string[];
  groupSize: string;
  budgetMax: number | null;
  radiusKm: number;
  activity: string[];
  demand?: boolean;
};
type Fixture = { demoUser: FixtureUser };

const fixture = JSON.parse(readFileSync(path.join(process.cwd(), 'tests/fixtures/social/preferences.json'), 'utf8')) as Fixture;

export async function seededUserIds(admin: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 500 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  return new Map(data.users.flatMap((u) => (u.email ? [[u.email, u.id] as const] : [])));
}

async function applyOne(admin: SupabaseClient, userId: string, u: FixtureUser): Promise<void> {
  const prefs = await admin.from('user_preferences').upsert({
    user_id: userId,
    interests: u.interests,
    interest_categories: u.categories,
    availability_slots: u.slots,
    social_goals: u.goals,
    group_size_pref: u.groupSize,
    budget_max_cents: u.budgetMax,
    travel_radius_km: u.radiusKm,
    activity_prefs: u.activity,
  });
  if (prefs.error) throw new Error(`user_preferences upsert (${u.email}) failed: ${prefs.error.message}`);
  const consent = {
    allow_matching: true,
    allow_demand_aggregation: u.demand ?? true,
    allow_group_planning: true,
    share_interests_with_attendees: true,
    share_name_with_business: false,
  };
  const agent = await admin.from('agent_profiles').upsert({ user_id: userId, consent });
  if (agent.error) throw new Error(`agent_profiles upsert (${u.email}) failed: ${agent.error.message}`);
}


/** The demo user as Scene 1 leaves them: pottery, coffee, Thursday evenings, small groups, onboarded. */
export async function applyDemoUserScene1(admin: SupabaseClient): Promise<string> {
  const ids = await seededUserIds(admin);
  const id = ids.get(fixture.demoUser.email);
  if (!id) throw new Error('demo user is not seeded');
  await applyOne(admin, id, fixture.demoUser);
  const { error } = await admin.from('profiles').update({ onboarding_completed_at: new Date().toISOString(), is_discoverable: true }).eq('id', id);
  if (error) throw new Error(`demo profile update failed: ${error.message}`);
  return id;
}
