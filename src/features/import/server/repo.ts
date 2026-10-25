import 'server-only';
import type { Database } from '@/lib/supabase/database.types';
import { ApiError } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import type { TraitSuggestion } from '../schemas';
import type { Candidate, DislikeCandidate, Existing } from './pipeline';

/**
 * Data access for 07's tables. Reads and writes use the service role after the route has
 * authenticated the user; every query is scoped to that user id. RLS still lets an owner read
 * their own rows and nobody else's.
 */

type SuggestionRow = Database['public']['Tables']['trait_suggestions']['Row'];

function check<T>(res: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) throw new ApiError('INTERNAL', `Failed to ${what}`, 500, { code: res.error.code });
  return res.data;
}

const admin = () => createAdminClient();

export async function countRunsSince(userId: string, since: Date): Promise<number> {
  const res = await admin().from('import_runs').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since.toISOString());
  check(res, 'count import runs');
  return res.count ?? 0;
}

export async function insertRun(userId: string, sources: readonly string[], screens: number, stats: Record<string, number | boolean>, aiUsed: boolean): Promise<string> {
  const res = await admin().from('import_runs').insert({ user_id: userId, sources: [...sources], screens, stats, ai_used: aiUsed }).select('id').single();
  const row = check(res, 'save import run');
  if (!row) throw new ApiError('INTERNAL', 'Failed to save import run', 500);
  return row.id;
}

/** Expired pending rows are deleted before any read (lazy 30-day expiry). */
export async function deleteExpired(userId: string): Promise<number> {
  const res = await admin().from('trait_suggestions').delete().eq('user_id', userId).eq('status', 'pending').lte('expires_at', new Date().toISOString()).select('id');
  return check(res, 'expire suggestions')?.length ?? 0;
}

/** What a new run must not suggest again: pending values and every dislike / "not me". */
export async function loadExisting(userId: string, prefs: { interests: string[]; activityPrefs: string[] }): Promise<Existing> {
  const [pending, dislikes] = await Promise.all([
    admin().from('trait_suggestions').select('field, value').eq('user_id', userId).eq('status', 'pending'),
    admin().from('taste_dislikes').select('label, tag').eq('user_id', userId),
  ]);
  const pendingRows = check(pending, 'load pending suggestions') ?? [];
  const dislikeRows = check(dislikes, 'load dislikes') ?? [];
  return {
    interests: prefs.interests,
    activityPrefs: prefs.activityPrefs,
    pending: new Set(pendingRows.map((r) => `${r.field}:${r.value}`)),
    dislikes: new Set(dislikeRows.flatMap((r) => [r.label, ...(r.tag ? [r.tag] : [])])),
  };
}

export async function insertSuggestions(
  userId: string,
  runId: string,
  traits: readonly Candidate[],
  dislikes: readonly DislikeCandidate[],
  model: string | null,
): Promise<number> {
  const rows = [
    ...traits.map((c) => ({
      user_id: userId, run_id: runId, field: c.field, value: c.value, label: c.label, category: c.category,
      confidence: c.confidence, band: c.band, evidence: c.evidence, model: c.usedModel ? model : null,
    })),
    // "Less of this" cards: the user's own see-less choice is the evidence, always shown.
    ...dislikes.map((d) => ({
      user_id: userId, run_id: runId, field: 'dislike', value: d.value, label: d.label, category: d.category,
      confidence: 0.6, band: 'some', evidence: [`You told Instagram to show less "${d.label}"`], model: null,
    })),
  ];
  if (rows.length === 0) return 0;
  const res = await admin().from('trait_suggestions').insert(rows).select('id');
  return check(res, 'save suggestions')?.length ?? 0;
}

function toSuggestion(row: SuggestionRow): TraitSuggestion {
  return {
    id: row.id,
    field: row.field as TraitSuggestion['field'],
    value: row.value,
    label: row.label,
    category: row.category,
    confidence: Number(row.confidence),
    band: row.band as TraitSuggestion['band'],
    evidence: Array.isArray(row.evidence) ? (row.evidence as string[]) : [],
    expiresAt: row.expires_at,
  };
}

const BAND_ORDER = { strong: 0, some: 1, weak: 2 } as const;

export async function listPending(userId: string): Promise<TraitSuggestion[]> {
  const res = await admin().from('trait_suggestions').select('*').eq('user_id', userId).eq('status', 'pending').gt('expires_at', new Date().toISOString());
  return (check(res, 'load suggestions') ?? [])
    .map(toSuggestion)
    .sort((a, b) => BAND_ORDER[a.band] - BAND_ORDER[b.band] || b.confidence - a.confidence || a.label.localeCompare(b.label));
}

export async function countPending(userId: string): Promise<number> {
  const res = await admin().from('trait_suggestions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending').gt('expires_at', new Date().toISOString());
  check(res, 'count suggestions');
  return res.count ?? 0;
}

export async function loadByIds(userId: string, ids: readonly string[]): Promise<SuggestionRow[]> {
  const res = await admin().from('trait_suggestions').select('*').eq('user_id', userId).in('id', [...ids]);
  return check(res, 'load suggestions') ?? [];
}

export type DecisionRow = { id: string; status: 'accepted' | 'edited' | 'rejected'; strength: 'love' | 'yes' | null; edited_value: string | null };
export type ProvenanceRow = { field: 'interests' | 'activity_prefs'; value: string; origin: 'import_accepted' | 'import_edited'; strength: 'love' | 'yes'; suggestion_id: string };
export type DislikeRow = { label: string; tag: string | null; source: 'not_me' | 'see_less' };

/** Atomic: every suggestion must still be pending, else nothing changes and CONFLICT is thrown. */
export async function applyDecisions(userId: string, decisions: DecisionRow[], provenance: ProvenanceRow[], dislikes: DislikeRow[]): Promise<void> {
  const { error } = await admin().rpc('import_decide', { p_user: userId, p_decisions: decisions, p_provenance: provenance, p_dislikes: dislikes });
  if (!error) return;
  if (error.message.includes('IMPORT_CONFLICT')) throw new ApiError('CONFLICT', 'Some of these suggestions were already decided. Refresh to see the latest.');
  throw new ApiError('INTERNAL', 'Failed to save decisions', 500, { code: error.code });
}

export async function listLovedAndDislikes(userId: string): Promise<{ loved: Set<string>; dislikes: { label: string; tag: string | null }[] }> {
  const [prov, dis] = await Promise.all([
    admin().from('trait_provenance').select('field, value, strength').eq('user_id', userId),
    admin().from('taste_dislikes').select('label, tag').eq('user_id', userId),
  ]);
  const loved = new Set((check(prov, 'load provenance') ?? []).filter((r) => r.strength === 'love').map((r) => r.value));
  return { loved, dislikes: check(dis, 'load dislikes') ?? [] };
}
