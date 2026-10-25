import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAgentAction } from "@/features/core";
import { resolveCategories } from "@/features/matching";
import { ApiError } from "@/lib/api";
import { TagSchema, type FieldSources, type PreferenceField, type UserPreferencesWithSources } from "../schemas";
import { applyPatch } from "./preferences";
import * as repo from "./repo";

const MAX_INTERESTS = 50;
const MAX_ACTIVITY_PREFS = 30;

export type ConfirmedTraits = { interests?: readonly string[]; activityPrefs?: readonly string[] };

function normalized(values: readonly string[] | undefined): string[] {
  return (values ?? []).flatMap((v) => {
    const parsed = TagSchema.safeParse(v);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Field sources after adding values the user explicitly confirmed elsewhere (07's review).
 * Before onboarding is reviewed an `ai_inferred` field stays `ai_inferred`, so adding one
 * suggestion never silently confirms the other inferred values; otherwise it becomes `user_set`.
 */
export function confirmedSources(
  current: FieldSources,
  touched: readonly PreferenceField[],
  onboardingReviewed: boolean,
): FieldSources {
  const keepInferred = (f: PreferenceField) => !onboardingReviewed && current[f] === "ai_inferred";
  return {
    ...current,
    ...Object.fromEntries(touched.map((f) => [f, keepInferred(f) ? "ai_inferred" : "user_set"])),
  };
}

/** Set-union of confirmed traits into a preferences row, with derived categories and caps. */
export function unionTraits(
  current: UserPreferencesWithSources,
  traits: ConfirmedTraits,
  onboardingReviewed: boolean,
): UserPreferencesWithSources {
  const addInterests = normalized(traits.interests);
  const addActivity = normalized(traits.activityPrefs);
  const interests = [...new Set([...current.interests, ...addInterests])];
  const activityPrefs = [...new Set([...current.activityPrefs, ...addActivity])];
  if (interests.length > MAX_INTERESTS) {
    throw new ApiError("VALIDATION", `Your profile holds up to ${MAX_INTERESTS} interests. Remove one to add more.`, 400, { field: "interests" });
  }
  if (activityPrefs.length > MAX_ACTIVITY_PREFS) {
    throw new ApiError("VALIDATION", `Your profile holds up to ${MAX_ACTIVITY_PREFS} activity styles.`, 400, { field: "activityPrefs" });
  }
  const touched: PreferenceField[] = [
    ...(addInterests.length > 0 ? (["interests", "interestCategories"] as const) : []),
    ...(addActivity.length > 0 ? (["activityPrefs"] as const) : []),
  ];
  const interestCategories = [...new Set([...current.interestCategories, ...resolveCategories(addInterests)])];
  const next = applyPatch(current, { interests, activityPrefs, interestCategories });
  return { ...next, fieldSources: confirmedSources(current.fieldSources, touched, onboardingReviewed) };
}

/** Service-role write used by `addConfirmedTraits` in index.ts; one action-log row with counts only. */
export async function addConfirmedTraitsWith(
  admin: SupabaseClient,
  userId: string,
  traits: ConfirmedTraits,
): Promise<{ interests: string[]; activityPrefs: string[] }> {
  const [current, profile] = await Promise.all([
    repo.getPreferences(admin, userId),
    admin.from("profiles").select("onboarding_completed_at").eq("id", userId).maybeSingle(),
  ]);
  if (profile.error) throw new ApiError("INTERNAL", "Failed to load profile", 500, { code: profile.error.code });
  const reviewed = Boolean((profile.data as { onboarding_completed_at: string | null } | null)?.onboarding_completed_at);
  const saved = await repo.savePreferences(admin, userId, unionTraits(current, traits, reviewed));
  const added = {
    interests: saved.interests.length - current.interests.length,
    activityPrefs: saved.activityPrefs.length - current.activityPrefs.length,
  };
  await logAgentAction({
    userId,
    action: "add_confirmed_traits",
    permissionsUsed: [],
    result: `Added ${added.interests} interests and ${added.activityPrefs} activity styles you chose`,
  });
  return { interests: saved.interests, activityPrefs: saved.activityPrefs };
}
