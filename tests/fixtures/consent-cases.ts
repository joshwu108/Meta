/**
 * Shared AC3 fixture (owned by ws02, reused by 03 matching and 04 demand tests).
 * Users whose consent is off for a purpose must never appear in that purpose's output.
 */
import seed from "../../supabase/seed/fixtures/preferences.json";

export const SEED_PREFERENCES = seed;

/** Seed emails whose `allow_demand_aggregation` is false: 04's pipeline must never count them. */
export const DEMAND_OPT_OUT_EMAILS = seed.filter((u) => !u.consent.allow_demand_aggregation).map((u) => u.email);

/** Seed emails whose `allow_matching` is false: 03 must neither show them nor show anyone to them. */
export const MATCHING_OPT_OUT_EMAILS = seed.filter((u) => !u.consent.allow_matching).map((u) => u.email);
