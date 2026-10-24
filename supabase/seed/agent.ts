import type { SupabaseClient } from "@supabase/supabase-js";
import fixtures from "./fixtures/preferences.json";
import { ConsentSchema, UserPreferencesSchema } from "../../src/features/agent/schemas";

/** Subset of 01's `SeedContext` this loader needs. */
export type AgentSeedContext = {
  admin: SupabaseClient;
  usersByEmail: ReadonlyMap<string, string>;
  log?: (message: string) => void;
};

/**
 * ws02 seed step: preferences + agent profiles for the 14 seeded consumers, keyed by the
 * emails in 01's users.json. Call from 01's runner after `loadUsers(ctx)`.
 */
export async function loadAgentPreferences(ctx: AgentSeedContext): Promise<number> {
  const rows = fixtures.flatMap((f) => {
    const userId = ctx.usersByEmail.get(f.email);
    if (!userId) {
      ctx.log?.(`agent seed: skipping unknown user ${f.email}`);
      return [];
    }
    const p = UserPreferencesSchema.parse(f.preferences);
    const sources = Object.fromEntries(Object.keys(p).map((k) => [k, "user_set"]));
    return [{
      prefs: {
        user_id: userId, interests: p.interests, interest_categories: p.interestCategories,
        availability_slots: p.availabilitySlots, social_goals: p.socialGoals, group_size_pref: p.groupSizePref,
        budget_min_cents: p.budgetMinCents, budget_max_cents: p.budgetMaxCents, travel_radius_km: p.travelRadiusKm,
        activity_prefs: p.activityPrefs, dealbreakers: p.dealbreakers, field_sources: sources,
      },
      agent: { user_id: userId, summary: f.summary, consent: ConsentSchema.parse(f.consent), consent_updated_at: new Date().toISOString() },
    }];
  });
  if (rows.length === 0) return 0;
  const prefs = await ctx.admin.from("user_preferences").upsert(rows.map((r) => r.prefs));
  if (prefs.error) throw new Error(`seed user_preferences: ${prefs.error.message}`);
  const agents = await ctx.admin.from("agent_profiles").upsert(rows.map((r) => r.agent));
  if (agents.error) throw new Error(`seed agent_profiles: ${agents.error.message}`);
  ctx.log?.(`agent seed: ${rows.length} users`);
  return rows.length;
}
