import type { SeedContext } from '../context';
import { SEED_PASSWORD } from '../types';
import { cohortPlans, plannedMemberCount } from '../generate/cohorts';
import { generatePeople, type GeneratedPerson } from '../generate/personas';

/**
 * Writes the generated population to Supabase: auth users, profiles, preferences and agent
 * profiles. Additive only -- the hand-written demo fixtures are untouched, and these emails are
 * namespaced under `gen.` so nothing the e2e suites assert on can collide.
 *
 * `SEED_SCALE` sets the headcount (default 300). `0` disables it entirely, which is what CI and
 * the Playwright suites use so their runtime does not regress.
 */

/** Concurrent `createUser` calls. Each bcrypt-hashes a password, so serial would take minutes. */
const CREATE_CONCURRENCY = 16;
/** Rows per insert; PostgREST rejects very large payloads. */
const INSERT_CHUNK = 100;

export const DEFAULT_SEED_SCALE = 300;

export function seedScale(): number {
  const raw = process.env.SEED_SCALE;
  if (raw === undefined || raw.trim() === '') return DEFAULT_SEED_SCALE;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : DEFAULT_SEED_SCALE;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Create one auth user; the signup trigger creates the matching profile row. */
async function createPerson(ctx: SeedContext, person: GeneratedPerson): Promise<string> {
  const { data, error } = await ctx.admin.auth.admin.createUser({
    email: person.email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: person.displayName, is_adult_confirmed: true, signup_as: 'consumer' },
  });
  if (error || !data.user) throw new Error(`createUser(${person.email}) failed: ${error?.message}`);
  ctx.usersByEmail.set(person.email, data.user.id);
  return data.user.id;
}

export async function loadGeneratedPeople(ctx: SeedContext): Promise<number> {
  const total = seedScale();
  if (total === 0) {
    ctx.log('generated people: SEED_SCALE=0, skipping');
    return 0;
  }

  const plans = cohortPlans();
  const people = generatePeople(total, plans);
  ctx.log(
    `generated people: ${people.length} personas across ${plans.length} planted cohorts ` +
      `(${plannedMemberCount(plans)} cohort members, ${people.length - plannedMemberCount(plans)} unaffiliated)`,
  );

  // Auth users in bounded batches, so 300 creations do not run serially.
  const ids = new Map<string, string>();
  for (const batch of chunk(people, CREATE_CONCURRENCY)) {
    const created = await Promise.all(batch.map((person) => createPerson(ctx, person)));
    batch.forEach((person, i) => ids.set(person.email, created[i] as string));
  }
  ctx.log(`generated people: created ${ids.size} auth users`);

  // Profiles exist from the trigger; fill in the fields it cannot know.
  for (const batch of chunk(people, INSERT_CHUNK)) {
    await Promise.all(
      batch.map(async (person) => {
        const { error } = await ctx.admin
          .from('profiles')
          .update({
            neighborhood: person.neighborhood,
            coarse_lat: person.coarseLat,
            coarse_lng: person.coarseLng,
            is_discoverable: person.isDiscoverable,
            bio: person.bio,
            is_adult_confirmed: true,
            onboarding_completed_at: new Date().toISOString(),
          })
          .eq('id', ids.get(person.email) as string);
        if (error) throw new Error(`profile update for ${person.email} failed: ${error.message}`);
      }),
    );
  }

  const prefRows = people.map((person) => ({
    user_id: ids.get(person.email) as string,
    interests: person.interests,
    interest_categories: person.interestCategories,
    availability_slots: person.availabilitySlots,
    social_goals: person.socialGoals,
    group_size_pref: person.groupSizePref,
    budget_min_cents: person.budgetMinCents,
    budget_max_cents: person.budgetMaxCents,
    travel_radius_km: person.travelRadiusKm,
    activity_prefs: person.activityPrefs,
    dealbreakers: [],
    field_sources: {},
  }));
  for (const batch of chunk(prefRows, INSERT_CHUNK)) {
    const { error } = await ctx.admin.from('user_preferences').upsert(batch);
    if (error) throw new Error(`generated user_preferences failed: ${error.message}`);
  }

  const agentRows = people.map((person) => ({
    user_id: ids.get(person.email) as string,
    summary: person.summary,
    consent: person.consent,
    consent_updated_at: new Date().toISOString(),
  }));
  for (const batch of chunk(agentRows, INSERT_CHUNK)) {
    const { error } = await ctx.admin.from('agent_profiles').upsert(batch);
    if (error) throw new Error(`generated agent_profiles failed: ${error.message}`);
  }

  const consenting = people.filter((p) => p.consent.allow_demand_aggregation).length;
  ctx.log(`generated people: ${people.length} preferences, ${consenting} consent to demand aggregation`);
  return people.length;
}
