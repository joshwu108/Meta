import 'server-only';
import { addConfirmedTraits } from '@/features/agent';
import { logAgentAction } from '@/features/core';
import { invalidateMatches, normalizeTag } from '@/features/matching';
import { ApiError } from '@/lib/api';
import type { DecideAction, DecideRequest, DecideResult } from '../schemas';
import * as repo from './repo';
import { lookupLabel } from './vocabulary';
import type { DecisionRow, DislikeRow, ProvenanceRow } from './repo';

type Row = Awaited<ReturnType<typeof repo.loadByIds>>[number];
type Plan = { decisions: DecisionRow[]; provenance: ProvenanceRow[]; dislikes: DislikeRow[]; add: { interests: string[]; activityPrefs: string[] } };

const TRAIT_ACTIONS: ReadonlySet<DecideAction> = new Set(['love', 'yes', 'edit', 'not_me']);
const DISLIKE_ACTIONS: ReadonlySet<DecideAction> = new Set(['keep_dislike', 'ignore']);

function editedValue(raw: string | undefined): string {
  const tag = normalizeTag(raw ?? '');
  if (!tag || tag.length > 40) throw new ApiError('VALIDATION', 'Type a short interest, up to 40 characters', 400, { field: 'value' });
  return tag;
}

/**
 * Turn one batch of review taps into the rows to write (pure). Love it / Yes / Edit add the
 * value; Not me remembers it so it is never suggested again; Less of this cards become
 * dislikes or are ignored. Actions must fit the card's kind.
 */
export function planDecisions(rows: readonly Row[], request: DecideRequest): Plan {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const plan: Plan = { decisions: [], provenance: [], dislikes: [], add: { interests: [], activityPrefs: [] } };
  const seen = new Set<string>();
  for (const { id, action, value } of request.decisions) {
    const row = byId.get(id);
    if (!row) throw new ApiError('NOT_FOUND', 'That suggestion no longer exists. Refresh to see the latest.');
    if (row.status !== 'pending') throw new ApiError('CONFLICT', 'Some of these suggestions were already decided. Refresh to see the latest.');
    if (seen.has(id)) throw new ApiError('VALIDATION', 'Each suggestion can be decided once per request', 400, { field: 'decisions' });
    seen.add(id);
    const isDislike = row.field === 'dislike';
    if ((isDislike && !DISLIKE_ACTIONS.has(action)) || (!isDislike && !TRAIT_ACTIONS.has(action))) {
      throw new ApiError('VALIDATION', `"${action}" does not apply to this card`, 400, { field: 'decisions' });
    }
    if (isDislike) {
      plan.decisions.push({ id, status: action === 'keep_dislike' ? 'accepted' : 'rejected', strength: null, edited_value: null });
      if (action === 'keep_dislike') plan.dislikes.push({ label: row.value, tag: lookupLabel(row.label)?.tag ?? null, source: 'see_less' });
      continue;
    }
    const field = row.field as 'interests' | 'activity_prefs';
    if (action === 'not_me') {
      plan.decisions.push({ id, status: 'rejected', strength: null, edited_value: null });
      plan.dislikes.push({ label: row.value, tag: row.value, source: 'not_me' });
      continue;
    }
    const finalValue = action === 'edit' ? editedValue(value) : row.value;
    const strength = action === 'love' ? 'love' : 'yes';
    plan.decisions.push({ id, status: action === 'edit' ? 'edited' : 'accepted', strength, edited_value: action === 'edit' ? finalValue : null });
    plan.provenance.push({ field, value: finalValue, origin: action === 'edit' ? 'import_edited' : 'import_accepted', strength, suggestion_id: id });
    (field === 'interests' ? plan.add.interests : plan.add.activityPrefs).push(finalValue);
  }
  return plan;
}

/** All-or-nothing review batch: decisions first (atomic), then the approved values via 02. */
export async function decideSuggestions(userId: string, request: DecideRequest): Promise<DecideResult> {
  const rows = await repo.loadByIds(userId, request.decisions.map((d) => d.id));
  const plan = planDecisions(rows, request);
  await repo.applyDecisions(userId, plan.decisions, plan.provenance, plan.dislikes);
  const adding = plan.add.interests.length + plan.add.activityPrefs.length > 0;
  const profile = adding ? await addConfirmedTraits(userId, plan.add) : null;
  if (adding) invalidateMatches(userId);
  const added = plan.provenance.length;
  const dislikes = plan.dislikes.filter((d) => d.source === 'see_less').length;
  const dismissed = plan.decisions.length - added - dislikes;
  await logAgentAction({
    userId,
    action: 'import_apply_traits',
    permissionsUsed: [],
    result: `Added ${added}, dismissed ${dismissed}, kept ${dislikes} as dislikes`,
  });
  return { added, dismissed, dislikes, profile };
}
