import type { SharablePreferences } from "@/shared/types";
import type { Consent, ConsentKey, SharingPurpose, UserPreferences } from "../schemas";

export const CONSENT_FOR_PURPOSE: Record<SharingPurpose, ConsentKey> = {
  matching: "allow_matching",
  demand: "allow_demand_aggregation",
  group_plan: "allow_group_planning",
};

/** Used when the user never stated a group size; the contract type is non-null. */
export const DEFAULT_GROUP_SIZE = "small" as const;

export type SharableSource = {
  userId: string;
  preferences: UserPreferences;
  consent: Consent;
  isDiscoverable: boolean;
  neighborhood: string | null;
  coarseLat: number | null;
  coarseLng: number | null;
};

/**
 * The coordination boundary. Returns null unless the user consented to `purpose`
 * (and, for matching, is discoverable). Never includes dealbreakers, field
 * sources, the agent summary, or any conversation content.
 */
export function toSharable(src: SharableSource, purpose: SharingPurpose): SharablePreferences | null {
  if (!src.consent[CONSENT_FOR_PURPOSE[purpose]]) return null;
  if (purpose === "matching" && !src.isDiscoverable) return null;
  const p = src.preferences;
  return {
    userId: src.userId,
    interests: [...p.interests],
    availabilitySlots: [...p.availabilitySlots],
    socialGoals: [...p.socialGoals],
    groupSizePref: p.groupSizePref ?? DEFAULT_GROUP_SIZE,
    budgetMin: p.budgetMinCents,
    budgetMax: p.budgetMaxCents,
    travelRadiusKm: p.travelRadiusKm,
    activityPrefs: [...p.activityPrefs],
    coarseLat: src.coarseLat,
    coarseLng: src.coarseLng,
    neighborhood: src.neighborhood,
  };
}

export type SharingDeps = {
  loadSources: (userIds: readonly string[]) => Promise<SharableSource[]>;
  /** Users who already have a share log row for this purpose inside the dedupe window. */
  recentlyLogged: (userIds: readonly string[], purpose: SharingPurpose) => Promise<Set<string>>;
  writeLogs: (userIds: readonly string[], purpose: SharingPurpose) => Promise<void>;
};

/**
 * Batch form used by 03/04: one load, one log insert per call. Each shared user
 * gets one log row per purpose per window so their activity log shows it (AC5)
 * without a row per request.
 */
export async function shareBatch(
  deps: SharingDeps,
  userIds: readonly string[],
  purpose: SharingPurpose,
): Promise<Map<string, SharablePreferences>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const sources = await deps.loadSources(unique);
  const shared = sources
    .map((s) => toSharable(s, purpose))
    .filter((s): s is SharablePreferences => s !== null);
  const sharedIds = shared.map((s) => s.userId);
  if (sharedIds.length > 0) {
    const skip = await deps.recentlyLogged(sharedIds, purpose);
    const toLog = sharedIds.filter((id) => !skip.has(id));
    if (toLog.length > 0) await deps.writeLogs(toLog, purpose);
  }
  return new Map(shared.map((s) => [s.userId, s]));
}
