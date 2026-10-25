import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Consent, FeedbackNote, SharingPurpose, SuggestionCard, UserPreferencesWithSources } from "../schemas";
import {
  PREFERENCES_COLUMNS,
  parseConsent,
  parseFeedbackNotes,
  patchToColumns,
  rowToPreferences,
  type PreferencesRow,
} from "./rows";
import type { SharableSource } from "./sharable";
import { ApiError } from "@/lib/api";

/**
 * Data access for workstream 02 tables. User-scoped functions take the caller's
 * RLS-bound client; the `admin*` functions are the only service-role reads and
 * back `getSharablePreferences`.
 */

function check<T>(res: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) throw new ApiError("INTERNAL", `Failed to ${what}`, 500, { code: res.error.code });
  return res.data;
}

/**
 * PostgREST puts `.in()` values in the URL and the gateway answers 414 above ~200 uuids, so
 * batch reads go 100 ids per request (03 measured 200 ok, 250 rejected).
 */
export const ID_CHUNK = 100;

export function chunkIds(ids: readonly string[], size = ID_CHUNK): string[][] {
  const unique = [...new Set(ids)];
  return Array.from({ length: Math.ceil(unique.length / size) }, (_, i) => unique.slice(i * size, (i + 1) * size));
}

type ListResult = { data: unknown[] | null; error: { message: string; code?: string } | null };

/** Runs `query` once per id chunk in parallel and concatenates the rows; any failed chunk throws. */
async function selectInChunks<T>(ids: readonly string[], what: string, query: (chunk: string[]) => PromiseLike<ListResult>): Promise<T[]> {
  const results = await Promise.all(chunkIds(ids).map((chunk) => query(chunk)));
  return results.flatMap((res) => (check(res, what) ?? []) as T[]);
}

export async function getPreferences(sb: SupabaseClient, userId: string): Promise<UserPreferencesWithSources> {
  const res = await sb.from("user_preferences").select(PREFERENCES_COLUMNS).eq("user_id", userId).maybeSingle();
  return rowToPreferences(check(res, "load preferences") as PreferencesRow | null);
}

export async function savePreferences(
  sb: SupabaseClient,
  userId: string,
  prefs: UserPreferencesWithSources,
): Promise<UserPreferencesWithSources> {
  const { fieldSources, ...values } = prefs;
  const row = { user_id: userId, ...patchToColumns(values), field_sources: fieldSources };
  const res = await sb.from("user_preferences").upsert(row).select(PREFERENCES_COLUMNS).single();
  return rowToPreferences(check(res, "save preferences") as PreferencesRow);
}

export type AgentProfile = { summary: string | null; consent: Consent };

export async function getAgentProfile(sb: SupabaseClient, userId: string): Promise<AgentProfile> {
  const res = await sb.from("agent_profiles").select("summary, consent").eq("user_id", userId).maybeSingle();
  const row = check(res, "load agent profile") as { summary: string | null; consent: unknown } | null;
  return { summary: row?.summary ?? null, consent: parseConsent(row?.consent) };
}

export async function saveAgentProfile(
  sb: SupabaseClient,
  userId: string,
  patch: { summary?: string | null; consent?: Consent },
): Promise<AgentProfile> {
  const row = {
    user_id: userId,
    ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
    ...(patch.consent ? { consent: patch.consent, consent_updated_at: new Date().toISOString() } : {}),
  };
  const res = await sb.from("agent_profiles").upsert(row).select("summary, consent").single();
  const saved = check(res, "save agent profile") as { summary: string | null; consent: unknown };
  return { summary: saved.summary, consent: parseConsent(saved.consent) };
}

export async function getFeedbackNotes(sb: SupabaseClient, userId: string): Promise<FeedbackNote[]> {
  const res = await sb.from("agent_profiles").select("feedback_notes").eq("user_id", userId).maybeSingle();
  const row = check(res, "load feedback") as { feedback_notes: unknown } | null;
  return parseFeedbackNotes(row?.feedback_notes);
}

export async function saveFeedbackNotes(sb: SupabaseClient, userId: string, notes: readonly FeedbackNote[]): Promise<void> {
  check(await sb.from("agent_profiles").upsert({ user_id: userId, feedback_notes: notes }), "save feedback");
}

export type ConversationKind = "onboarding" | "chat";
export type StoredMessage = { role: "user" | "assistant"; content: string; suggestions: SuggestionCard[] | null };

/** Use the given conversation if the caller owns it (RLS), else the latest of that kind, else a new one. */
export async function resolveConversation(
  sb: SupabaseClient,
  userId: string,
  kind: ConversationKind,
  conversationId?: string,
): Promise<string> {
  const base = sb.from("agent_conversations").select("id").eq("user_id", userId).eq("kind", kind);
  const query = conversationId ? base.eq("id", conversationId) : base.order("created_at", { ascending: false });
  const found = check(await query.limit(1).maybeSingle(), "load conversation") as { id: string } | null;
  if (found) return found.id;
  if (conversationId) throw new ApiError("NOT_FOUND", "Conversation not found");
  const created = await sb.from("agent_conversations").insert({ user_id: userId, kind }).select("id").single();
  return (check(created, "create conversation") as { id: string }).id;
}

export async function listMessages(sb: SupabaseClient, conversationId: string, limit = 20): Promise<StoredMessage[]> {
  const res = await sb
    .from("agent_messages")
    .select("role, content, suggestions, created_at")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = check(res, "load messages") as StoredMessage[];
  return [...rows].reverse().map(({ role, content, suggestions }) => ({ role, content, suggestions }));
}

export async function addMessages(
  sb: SupabaseClient,
  conversationId: string,
  messages: readonly StoredMessage[],
): Promise<void> {
  const base = Date.now();
  // Explicit, increasing timestamps keep user → assistant order stable within one insert.
  const rows = messages.map((m, i) => ({
    conversation_id: conversationId,
    role: m.role,
    content: m.content,
    suggestions: m.suggestions,
    created_at: new Date(base + i).toISOString(),
  }));
  check(await sb.from("agent_messages").insert(rows), "save messages");
}

export async function updateProfile(
  sb: SupabaseClient,
  userId: string,
  values: Record<string, string | number | boolean | null>,
): Promise<void> {
  check(await sb.from("profiles").update(values).eq("id", userId), "update profile");
}

export type AgentLogRow = {
  id: string;
  actor: string;
  action: string;
  permissions_used: string[];
  result: string;
  created_at: string;
};

export async function listAgentLog(sb: SupabaseClient, userId: string, limit: number): Promise<AgentLogRow[]> {
  const res = await sb
    .from("agent_action_log")
    .select("id, actor, action, permissions_used, result, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return check(res, "load agent log") as AgentLogRow[];
}

// ---- service-role reads, used only by the coordination boundary ----

type SourceRow = PreferencesRow & {
  profiles: { is_discoverable: boolean; neighborhood: string | null; coarse_lat: number | null; coarse_lng: number | null } | null;
};

export async function adminLoadSources(admin: SupabaseClient, userIds: readonly string[]): Promise<SharableSource[]> {
  const [prefs, agents] = await Promise.all([
    selectInChunks<SourceRow>(userIds, "load sharable preferences", (ids) =>
      admin
        .from("user_preferences")
        .select(`${PREFERENCES_COLUMNS}, profiles!inner(is_discoverable, neighborhood, coarse_lat, coarse_lng)`)
        .in("user_id", ids),
    ),
    selectInChunks<{ user_id: string; consent: unknown }>(userIds, "load consent", (ids) =>
      admin.from("agent_profiles").select("user_id, consent").in("user_id", ids),
    ),
  ]);
  const consentById = new Map(agents.map((a) => [a.user_id, a.consent]));
  return prefs.map((row) => {
    const { fieldSources: _ignored, ...preferences } = rowToPreferences(row);
    void _ignored;
    return {
      userId: row.user_id,
      preferences,
      consent: parseConsent(consentById.get(row.user_id)),
      isDiscoverable: row.profiles?.is_discoverable ?? false,
      neighborhood: row.profiles?.neighborhood ?? null,
      coarseLat: row.profiles?.coarse_lat == null ? null : Number(row.profiles.coarse_lat),
      coarseLng: row.profiles?.coarse_lng == null ? null : Number(row.profiles.coarse_lng),
    };
  });
}

export const SHARE_LOG_WINDOW_MS = 60 * 60 * 1000;

/** What a share log row records: a sharing purpose or the attendee-list consent. */
export type ShareLogKey = SharingPurpose | "attendees";

export async function adminRecentShareLogs(
  admin: SupabaseClient,
  userIds: readonly string[],
  purpose: ShareLogKey,
): Promise<Set<string>> {
  const since = new Date(Date.now() - SHARE_LOG_WINDOW_MS).toISOString();
  const rows = await selectInChunks<{ user_id: string }>(userIds, "load share logs", (ids) =>
    admin
      .from("agent_action_log")
      .select("user_id")
      .eq("actor", "coordination")
      .eq("action", "share_preferences")
      .contains("permissions_used", [purpose])
      .gte("created_at", since)
      .in("user_id", ids),
  );
  return new Set(rows.map((r) => r.user_id));
}

const PURPOSE_LABEL: Record<ShareLogKey, string> = {
  attendees: "fellow attendees of your events",
  matching: "people matching",
  demand: "community event demand (counted anonymously)",
  group_plan: "group activity planning",
};

export async function adminWriteShareLogs(
  admin: SupabaseClient,
  userIds: readonly string[],
  purpose: ShareLogKey,
): Promise<void> {
  const rows = userIds.map((id) => ({
    user_id: id,
    actor: "coordination",
    action: "share_preferences",
    permissions_used: [purpose],
    result: purpose === "attendees"
      ? `Shared your interests with ${PURPOSE_LABEL.attendees}`
      : `Shared your interests and availability for ${PURPOSE_LABEL[purpose]}`,
  }));
  const { error } = await admin.from("agent_action_log").insert(rows);
  // Logging must never break the caller's flow; failures are reported, not thrown.
  if (error) console.error(JSON.stringify({ level: "error", msg: "share_log_failed", code: error.code }));
}

export type ConsentRow = { userId: string; interests: string[]; consent: Consent };

/** Interests + consent for a set of users (attendee chips, server-side RSVP defaults). */
export async function adminLoadConsent(admin: SupabaseClient, userIds: readonly string[]): Promise<ConsentRow[]> {
  const [agents, prefs] = await Promise.all([
    selectInChunks<{ user_id: string; consent: unknown }>(userIds, "load consent", (ids) =>
      admin.from("agent_profiles").select("user_id, consent").in("user_id", ids),
    ),
    selectInChunks<{ user_id: string; interests: string[] }>(userIds, "load interests", (ids) =>
      admin.from("user_preferences").select("user_id, interests").in("user_id", ids),
    ),
  ]);
  const consentById = new Map(agents.map((a) => [a.user_id, a.consent]));
  const interestsById = new Map(prefs.map((p) => [p.user_id, p.interests]));
  return [...userIds].map((userId) => ({
    userId,
    interests: interestsById.get(userId) ?? [],
    consent: parseConsent(consentById.get(userId)),
  }));
}
