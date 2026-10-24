import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConsentPatchSchema,
  Consent,
  FieldSources,
  PreferenceField,
  UserPreferencesPatch,
  UserPreferencesWithSources,
} from "../schemas";
import * as repo from "./repo";
import { logAgentAction } from "@/features/core";
import { ApiError } from "@/lib/api";
import type { z } from "zod";

/**
 * Apply a user edit. Every touched field becomes `user_set`, including when the
 * user deletes an AI-inferred value (spec 7: deleting records `user_set`).
 */
export function applyPatch(
  current: UserPreferencesWithSources,
  patch: UserPreferencesPatch,
): UserPreferencesWithSources {
  const touched = Object.keys(patch).filter((k) => patch[k as PreferenceField] !== undefined) as PreferenceField[];
  const next = { ...current, ...patch };
  if (next.budgetMinCents != null && next.budgetMaxCents != null && next.budgetMinCents > next.budgetMaxCents) {
    throw new ApiError("VALIDATION", "Minimum budget cannot exceed maximum budget");
  }
  const fieldSources: FieldSources = {
    ...current.fieldSources,
    ...Object.fromEntries(touched.map((f) => [f, "user_set" as const])),
  };
  return { ...next, fieldSources };
}

export async function patchPreferences(
  sb: SupabaseClient,
  userId: string,
  patch: UserPreferencesPatch,
): Promise<UserPreferencesWithSources> {
  const current = await repo.getPreferences(sb, userId);
  return repo.savePreferences(sb, userId, applyPatch(current, patch));
}

export async function getPermissions(sb: SupabaseClient, userId: string): Promise<Consent> {
  return (await repo.getAgentProfile(sb, userId)).consent;
}

export async function patchPermissions(
  sb: SupabaseClient,
  userId: string,
  patch: z.infer<typeof ConsentPatchSchema>,
): Promise<Consent> {
  const current = await getPermissions(sb, userId);
  const next = { ...current, ...patch };
  const saved = await repo.saveAgentProfile(sb, userId, { consent: next });
  const changed = Object.keys(patch).filter((k) => current[k as keyof Consent] !== next[k as keyof Consent]);
  if (changed.length > 0) {
    await logAgentAction({
      userId,
      action: "update_permissions",
      permissionsUsed: changed,
      result: changed.map((k) => `${k.replace(/_/g, " ")}: ${next[k as keyof Consent] ? "on" : "off"}`).join(", "),
    });
  }
  return saved.consent;
}
