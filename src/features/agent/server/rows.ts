import {
  ConsentSchema,
  DEFAULT_CONSENT,
  EMPTY_PREFERENCES,
  FieldSourcesSchema,
  UserPreferencesSchema,
  type Consent,
  type FieldSources,
  type UserPreferences,
  type UserPreferencesPatch,
  type UserPreferencesWithSources,
} from "../schemas";

/** Snake-case row shape of `user_preferences`. */
export type PreferencesRow = {
  user_id: string;
  interests: string[];
  interest_categories: string[];
  availability_slots: string[];
  social_goals: string[];
  group_size_pref: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  travel_radius_km: number | string;
  activity_prefs: string[];
  dealbreakers: string[];
  field_sources: Record<string, unknown>;
};

export type AgentProfileRow = {
  user_id: string;
  summary: string | null;
  consent: Record<string, unknown>;
};

export const PREFERENCES_COLUMNS =
  "user_id, interests, interest_categories, availability_slots, social_goals, group_size_pref, budget_min_cents, budget_max_cents, travel_radius_km, activity_prefs, dealbreakers, field_sources";

const COLUMN_BY_FIELD = {
  interests: "interests",
  interestCategories: "interest_categories",
  availabilitySlots: "availability_slots",
  socialGoals: "social_goals",
  groupSizePref: "group_size_pref",
  budgetMinCents: "budget_min_cents",
  budgetMaxCents: "budget_max_cents",
  travelRadiusKm: "travel_radius_km",
  activityPrefs: "activity_prefs",
  dealbreakers: "dealbreakers",
} as const satisfies Record<keyof UserPreferences, keyof PreferencesRow>;

/** Parse a DB row; unknown enum values written by hand are dropped, not trusted. */
export function rowToPreferences(row: PreferencesRow | null): UserPreferencesWithSources {
  if (!row) return { ...EMPTY_PREFERENCES, fieldSources: {} };
  const candidate = {
    interests: row.interests,
    interestCategories: row.interest_categories,
    availabilitySlots: row.availability_slots,
    socialGoals: row.social_goals,
    groupSizePref: row.group_size_pref,
    budgetMinCents: row.budget_min_cents,
    budgetMaxCents: row.budget_max_cents,
    travelRadiusKm: Number(row.travel_radius_km),
    activityPrefs: row.activity_prefs,
    dealbreakers: row.dealbreakers,
  };
  const parsed = UserPreferencesSchema.safeParse(candidate);
  const prefs = parsed.success ? parsed.data : salvage(candidate);
  const sources = FieldSourcesSchema.safeParse(row.field_sources);
  return { ...prefs, fieldSources: sources.success ? sources.data : {} };
}

function salvage(candidate: Record<string, unknown>): UserPreferences {
  const shape = UserPreferencesSchema.shape;
  const entries = Object.entries(shape).map(([key, schema]) => {
    const value = candidate[key];
    if (Array.isArray(value)) {
      const item = (schema as unknown as { element: { safeParse: (v: unknown) => { success: boolean } } }).element;
      return [key, value.filter((v) => item.safeParse(v).success)];
    }
    const ok = schema.safeParse(value);
    return [key, ok.success ? ok.data : EMPTY_PREFERENCES[key as keyof UserPreferences]];
  });
  return Object.fromEntries(entries) as UserPreferences;
}

/** Convert a camelCase patch into column updates (only keys present in the patch). */
export function patchToColumns(patch: UserPreferencesPatch): Partial<PreferencesRow> {
  return Object.fromEntries(
    Object.entries(patch)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [COLUMN_BY_FIELD[k as keyof UserPreferences], v]),
  ) as Partial<PreferencesRow>;
}

export function sourcesToColumn(sources: FieldSources): Record<string, unknown> {
  return { ...sources };
}

export function parseConsent(raw: unknown): Consent {
  const merged = { ...DEFAULT_CONSENT, ...(typeof raw === "object" && raw ? raw : {}) };
  const parsed = ConsentSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_CONSENT;
}
