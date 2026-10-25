import { describe, expect, it, vi } from 'vitest';
import { fakeClient } from './fake-supabase';

vi.mock('server-only', () => ({}));

const { loadRevisable, revisionSaver } = await import('@/features/demand/server/store-revise');
const { groupProposalSaver, hasPendingGroupProposal, isActiveGroupMember } = await import('@/features/demand/server/store-group');
const { ApiError } = await import('@/lib/api');

const PROPOSAL = { title: 'Beginner Pottery & Coffee Night', demand: { band: '6-9' } };

describe('store-revise', () => {
  it('maps a visible row and its cluster budget', async () => {
    const { client, calls } = fakeClient({
      data: { id: 'p1', status: 'pending', business_id: 'b1', revision: 2, proposal: PROPOSAL, demand_clusters: { budget_p50_cents: 2000 } },
      error: null,
    });
    expect(await loadRevisable(client, 'p1')).toEqual({ id: 'p1', status: 'pending', businessId: 'b1', revision: 2, proposal: PROPOSAL, budgetP50Cents: 2000 });
    expect(calls[0]).toEqual(['from', ['event_proposals']]);
  });

  it('returns null when RLS hides the row and null budget for group proposals', async () => {
    expect(await loadRevisable(fakeClient({ data: null, error: null }).client, 'p1')).toBeNull();
    const group = fakeClient({ data: { id: 'p2', status: 'pending', business_id: 'b1', revision: 0, proposal: PROPOSAL, demand_clusters: null }, error: null });
    expect((await loadRevisable(group.client, 'p2'))?.budgetP50Cents).toBeNull();
  });

  it('throws on a read error', async () => {
    await expect(loadRevisable(fakeClient({ data: null, error: { message: 'boom' } }).client, 'p1')).rejects.toThrow('proposal lookup failed');
  });

  it('calls the revision RPC and maps its SQLSTATEs', async () => {
    const okClient = fakeClient({ data: 'p-new', error: null });
    const save = revisionSaver(okClient.client);
    expect(await save({ parentId: 'p1', proposal: PROPOSAL as never, request: { note: 'x' } })).toBe('p-new');
    expect(okClient.rpc).toHaveBeenCalledWith('save_proposal_revision', { p_parent_id: 'p1', p_proposal: PROPOSAL, p_request: { note: 'x' } });

    const codeOf = async (code: string) => {
      const error = await revisionSaver(fakeClient({ data: null, error: { code, message: code } }).client)({ parentId: 'p1', proposal: PROPOSAL as never, request: { note: 'x' } }).catch((e: unknown) => e);
      return error instanceof ApiError ? error.code : (error as Error).message;
    };
    expect(await codeOf('P0002')).toBe('NOT_FOUND');
    expect(await codeOf('55000')).toBe('CONFLICT');
    expect(await codeOf('23514')).toBe('CONFLICT');
    expect(await codeOf('XX000')).toContain('save revision failed');
  });
});

describe('store-group', () => {
  const key = { groupId: 'g1', planId: 'pl1', suggestionIndex: 2 };

  it('checks for a pending proposal on the exact suggestion', async () => {
    const hit = fakeClient({ data: [{ id: 'p1' }], error: null });
    expect(await hasPendingGroupProposal(hit.client, key)).toBe(true);
    expect(hit.calls.filter(([n]) => n === 'eq').map(([, a]) => a)).toEqual([
      ['source', 'group'], ['status', 'pending'], ['source_group_id', 'g1'], ['source_plan_id', 'pl1'], ['source_suggestion_index', 2],
    ]);
    expect(await hasPendingGroupProposal(fakeClient({ data: [], error: null }).client, key)).toBe(false);
    await expect(hasPendingGroupProposal(fakeClient({ data: null, error: { message: 'x' } }).client, key)).rejects.toThrow('group dedup');
  });

  it('inserts a group row and treats a unique violation as a lost race', async () => {
    const ok = fakeClient({ data: { id: 'p-g' }, error: null });
    expect(await groupProposalSaver(ok.client)({ key, businessId: 'b1', proposal: PROPOSAL as never })).toBe('p-g');
    expect(ok.calls.find(([n]) => n === 'insert')?.[1][0]).toEqual({
      source: 'group', source_group_id: 'g1', source_plan_id: 'pl1', source_suggestion_index: 2, business_id: 'b1', proposal: PROPOSAL,
    });
    expect(await groupProposalSaver(fakeClient({ data: null, error: { code: '23505', message: 'dup' } }).client)({ key, businessId: 'b1', proposal: PROPOSAL as never })).toBeNull();
    await expect(groupProposalSaver(fakeClient({ data: null, error: { code: '42P01', message: 'x' } }).client)({ key, businessId: 'b1', proposal: PROPOSAL as never })).rejects.toThrow('save group proposal');
  });

  it('reads membership with the caller client and fails closed', async () => {
    expect(await isActiveGroupMember(fakeClient({ data: { user_id: 'u1' }, error: null }).client, 'u1', 'g1')).toBe(true);
    expect(await isActiveGroupMember(fakeClient({ data: null, error: null }).client, 'u1', 'g1')).toBe(false);
    expect(await isActiveGroupMember(fakeClient({ data: null, error: { message: 'relation does not exist' } }).client, 'u1', 'g1')).toBe(false);
  });
});
