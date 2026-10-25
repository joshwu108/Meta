import 'server-only';
import { getOwnPreferencesForImport, removeImportedTraits } from '@/features/agent';
import { logAgentAction } from '@/features/core';
import { invalidateMatches } from '@/features/matching';
import { ApiError } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ImportSettings } from '../schemas';

function check<T>(res: { data: T; error: { code?: string } | null }, what: string): T {
  if (res.error) throw new ApiError('INTERNAL', `Failed to ${what}`, 500, { code: res.error.code });
  return res.data;
}

/** What came from Instagram, for the owner only. Added values are listed only while still in the profile. */
export async function getImportSettings(userId: string): Promise<ImportSettings> {
  const admin = createAdminClient();
  const [prov, dislikes, pending, lastRun, prefs] = await Promise.all([
    admin.from('trait_provenance').select('field, value, strength, confirmed_at').eq('user_id', userId).order('confirmed_at'),
    admin.from('taste_dislikes').select('label, source').eq('user_id', userId).order('created_at'),
    admin.from('trait_suggestions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending'),
    admin.from('import_runs').select('created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    getOwnPreferencesForImport(userId),
  ]);
  const inProfile = new Set([...prefs.interests.map((v) => `interests:${v}`), ...prefs.activityPrefs.map((v) => `activity_prefs:${v}`)]);
  return {
    added: (check(prov, 'load provenance') ?? [])
      .filter((r) => inProfile.has(`${r.field}:${r.value}`))
      .map((r) => ({ field: r.field as 'interests' | 'activity_prefs', value: r.value, strength: r.strength as 'love' | 'yes', confirmedAt: r.confirmed_at })),
    dislikes: (check(dislikes, 'load dislikes') ?? []).map((d) => ({ label: d.label, source: d.source as 'not_me' | 'see_less' })),
    pending: pending.count ?? 0,
    lastImportAt: check(lastRun, 'load runs')?.created_at ?? null,
  };
}

/**
 * Every table 07 keeps a member's data in. A "delete my data" request has to empty all of them, so
 * the list is exported and `tests/integration/import/import.test.ts` holds it against the tables
 * `0703_import.sql` actually creates — add a table to the migration without adding it here and
 * that test fails, rather than the row quietly surviving a deletion request.
 */
export const IMPORT_TABLES = [
  'trait_suggestions',
  'trait_provenance',
  'taste_dislikes',
  'import_plans',
  'import_runs',
] as const;

/**
 * "Delete my Instagram data": suggestions, dislikes, plans, runs and provenance go. The traits the
 * user added stay as their own (`keep`) or are removed from the profile too (`remove`).
 */
export async function deleteImportData(userId: string, acceptedTraits: 'keep' | 'remove'): Promise<{ deletedSuggestions: number; keptTraits: number; removedTraits: number }> {
  const admin = createAdminClient();
  const settings = await getImportSettings(userId);
  if (acceptedTraits === 'remove' && settings.added.length > 0) {
    await removeImportedTraits(userId, {
      interests: settings.added.filter((a) => a.field === 'interests').map((a) => a.value),
      activityPrefs: settings.added.filter((a) => a.field === 'activity_prefs').map((a) => a.value),
    });
    invalidateMatches(userId);
  }
  const suggestions = check(await admin.from('trait_suggestions').delete().eq('user_id', userId).select('id'), 'delete suggestions') ?? [];
  for (const table of IMPORT_TABLES.filter((name) => name !== 'trait_suggestions')) {
    check(await admin.from(table).delete().eq('user_id', userId), `delete ${table}`);
  }
  const result = {
    deletedSuggestions: suggestions.length,
    keptTraits: acceptedTraits === 'keep' ? settings.added.length : 0,
    removedTraits: acceptedTraits === 'remove' ? settings.added.length : 0,
  };
  await logAgentAction({
    userId,
    action: 'import_delete_data',
    permissionsUsed: [],
    result: `Deleted your Instagram data (${result.deletedSuggestions} suggestions); ${acceptedTraits === 'keep' ? `kept ${result.keptTraits}` : `removed ${result.removedTraits}`} traits you had added`,
  });
  return result;
}
