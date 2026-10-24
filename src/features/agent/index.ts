import "server-only";
import type { SharablePreferences } from "@/shared/types";
import type { SharingPurpose } from "./schemas";
import { adminLoadSources, adminRecentShareLogs, adminWriteShareLogs } from "./server/repo";
import { shareBatch, type SharingDeps } from "./server/sharable";
import { getAdminClient } from "./server/stubs";

/** Public surface of workstream 02. Other features import only from here. */

export { explainRecommendation, explainDetailed, type ExplainInput, type ExplainTarget } from "./server/explain";
export { suggestFollowUp } from "./server/follow-up";
export { resolveGroupSchedule, type GroupSchedule, type SlotOption } from "./server/group-schedule";
export type { Consent, SharingPurpose, SuggestionCard, FollowUpSuggestion } from "./schemas";

function adminDeps(): SharingDeps {
  const admin = getAdminClient();
  return {
    loadSources: (ids) => adminLoadSources(admin, ids),
    recentlyLogged: (ids, purpose) => adminRecentShareLogs(admin, ids, purpose),
    writeLogs: (ids, purpose) => adminWriteShareLogs(admin, ids, purpose),
  };
}

/**
 * Consent-gated read of one user's preferences for another feature.
 * Returns null unless the user consented to `purpose` (and, for matching, is discoverable).
 */
export async function getSharablePreferences(
  userId: string,
  purpose: SharingPurpose,
): Promise<SharablePreferences | null> {
  return (await shareBatch(adminDeps(), [userId], purpose)).get(userId) ?? null;
}

/**
 * Batch form for 03/04 pipelines: one query and one log insert per call.
 * Users who have not consented are simply absent from the map.
 */
export async function getSharablePreferencesBatch(
  userIds: readonly string[],
  purpose: SharingPurpose,
): Promise<Map<string, SharablePreferences>> {
  return shareBatch(adminDeps(), userIds, purpose);
}
