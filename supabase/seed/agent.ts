import type { SupabaseClient } from "@supabase/supabase-js";
import fixtures from "./fixtures/preferences.json";
import { ConsentSchema, UserPreferencesSchema } from "../../src/features/agent/schemas";

/** ws02 seed step: preferences + agent profiles for seeded users, keyed by email. Run after users. */
export async function seedAgent(admin: SupabaseClient, userIdByEmail: ReadonlyMap<string, string>): Promise<number> {
  const rows = fixtures.flatMap((f) => {
    const userId = userIdByEmail.get(f.email);
    if (!userId) return [];
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
  const prefs = await admin.from("user_preferences").upsert(rows.map((r) => r.prefs));
  if (prefs.error) throw new Error(`seed user_preferences: ${prefs.error.message}`);
  const agents = await admin.from("agent_profiles").upsert(rows.map((r) => r.agent));
  if (agents.error) throw new Error(`seed agent_profiles: ${agents.error.message}`);
  return rows.length;
}
