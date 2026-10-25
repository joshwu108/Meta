import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api";
import type { SharablePreferences } from "@/shared/types";
import type { PersonCandidate } from "./suggestions";

/**
 * `suggest_people` until 03's matches export reaches main: real, consented people only.
 * Candidates come from 01's `profile_public_cards` view (discoverable users, public fields) and
 * pass through ws02's own consent boundary for purpose `matching`, so anyone who has not
 * allowed matching is never suggested. Ranked by shared interests, then shared slots.
 */
export type PeopleDeps = {
  /** AC3: someone who has not allowed matching is shown nobody (same rule as 03's /match). */
  viewerAllowsMatching: (userId: string) => Promise<boolean>;
  publicCards: (excludeUserId: string, limit: number) => Promise<{ id: string; display_name: string; neighborhood: string | null }[]>;
  sharable: (userIds: readonly string[]) => Promise<Map<string, SharablePreferences>>;
};

const POOL = 50;

const overlap = (a: readonly string[], b: readonly string[]): number => a.filter((x) => b.includes(x)).length;

export async function suggestPeopleFrom(
  deps: PeopleDeps,
  viewer: Pick<SharablePreferences, "userId" | "interests" | "availabilitySlots">,
  limit = 3,
): Promise<PersonCandidate[]> {
  if (!(await deps.viewerAllowsMatching(viewer.userId))) return [];
  const cards = (await deps.publicCards(viewer.userId, POOL)).filter((c) => c.id !== viewer.userId);
  if (cards.length === 0) return [];
  const shared = await deps.sharable(cards.map((c) => c.id));
  return cards
    .flatMap((c) => {
      const preferences = shared.get(c.id);
      if (!preferences) return [];
      const interests = overlap(viewer.interests, preferences.interests);
      const slots = overlap(viewer.availabilitySlots, preferences.availabilitySlots);
      if (interests + slots === 0) return [];
      return [{ candidate: { id: c.id, displayName: c.display_name, neighborhood: c.neighborhood ?? "", preferences }, interests, slots }];
    })
    .sort((a, b) => b.interests - a.interests || b.slots - a.slots || a.candidate.displayName.localeCompare(b.candidate.displayName))
    .slice(0, limit)
    .map((r) => r.candidate);
}

/** Reads the public-card view with the service role; the view itself only exposes discoverable users. */
export async function adminPublicCards(admin: SupabaseClient, excludeUserId: string, limit: number) {
  const { data, error } = await admin
    .from("profile_public_cards")
    .select("id, display_name, neighborhood")
    .neq("id", excludeUserId)
    .limit(limit);
  if (error) throw new ApiError("INTERNAL", "Failed to load people suggestions", 500, { code: error.code });
  return (data ?? []) as { id: string; display_name: string; neighborhood: string | null }[];
}

/** Production wiring. Loaded lazily so this module does not import the feature index at load time. */
export async function suggestPeople(viewer: Pick<SharablePreferences, "userId" | "interests" | "availabilitySlots">, limit = 3): Promise<PersonCandidate[]> {
  const [{ getConsent, getSharablePreferencesBatch }, { createAdminClient }] = await Promise.all([import("../index"), import("@/lib/supabase/admin")]);
  const admin = createAdminClient() as unknown as SupabaseClient;
  return suggestPeopleFrom(
    {
      viewerAllowsMatching: async (id) => (await getConsent(id)).allow_matching,
      publicCards: (id, n) => adminPublicCards(admin, id, n),
      sharable: (ids) => getSharablePreferencesBatch(ids, "matching"),
    },
    viewer,
    limit,
  );
}
