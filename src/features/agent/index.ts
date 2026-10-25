import "server-only";
import type { SharablePreferences } from "@/shared/types";
import { DEFAULT_CONSENT, type Consent, type SharingPurpose } from "./schemas";
import { adminLoadConsent, adminLoadSources, adminRecentShareLogs, adminWriteShareLogs } from "./server/repo";
import { shareBatch, toAttendeeSharing, type AttendeeSharing, type SharingDeps } from "./server/sharable";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/** Service-role client, untyped: 01's generated types do not include ws02 tables until `pnpm db:types` runs. */
const getAdminClient = (): SupabaseClient => createAdminClient() as unknown as SupabaseClient;

/** Public surface of workstream 02. Other features import only from here. */

export { explainRecommendation, explainDetailed, type ExplainInput, type ExplainTarget } from "./server/explain";
export { suggestFollowUp } from "./server/follow-up";
export { resolveGroupSchedule, type GroupSchedule, type SlotOption } from "./server/group-schedule";
export type { Consent, SharingPurpose, SuggestionCard, FollowUpSuggestion } from "./schemas";
export type { AttendeeSharing } from "./server/sharable";

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

/**
 * For 06's attendee list: every requested user, with interests only when they turned on
 * `share_interests_with_attendees`. Each user whose interests are released gets one
 * activity-log row per hour.
 */
export async function getAttendeeSharing(userIds: readonly string[]): Promise<Map<string, AttendeeSharing>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const admin = getAdminClient();
  const rows = await adminLoadConsent(admin, unique);
  const result = new Map(rows.map((r) => [r.userId, toAttendeeSharing(r.interests, r.consent)]));
  const shared = rows.filter((r) => r.consent.share_interests_with_attendees && r.interests.length > 0).map((r) => r.userId);
  if (shared.length > 0) {
    const skip = await adminRecentShareLogs(admin, shared, "attendees");
    const toLog = shared.filter((id) => !skip.has(id));
    if (toLog.length > 0) await adminWriteShareLogs(admin, toLog, "attendees");
  }
  return result;
}

/** A user's consent flags, for server-side defaults (e.g. 06's RSVP sharing choices). */
export async function getConsent(userId: string): Promise<Consent> {
  const [row] = await adminLoadConsent(getAdminClient(), [userId]);
  return row?.consent ?? DEFAULT_CONSENT;
}
