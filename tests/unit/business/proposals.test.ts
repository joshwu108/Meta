import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '@/lib/api/errors';
import {
  countPendingProposals,
  getBusinessProposal,
  listBusinessProposals,
  toProposalSummary,
} from '@/features/business/server/proposals';
import { MemoryBusinessStore } from '../../support/memory-store';
import { PENDING_PROPOSAL, PROPOSAL_FIXTURE, testDeps, type TestDeps } from '../../support/fixtures';

/** Spec section 6 (inbox) and section 10 criterion 3. */
describe('proposal inbox', () => {
  let store: MemoryBusinessStore;
  let deps: TestDeps;
  let businessId: string;

  beforeEach(() => {
    store = new MemoryBusinessStore();
    businessId = store.seedBusiness({ owner_id: 'owner-1' }).business.id;
    deps = testDeps(store);
  });

  it('summarises a proposal without exposing the raw document fields it should not', async () => {
    const row = store.seedProposal(PENDING_PROPOSAL(businessId));
    const summary = toProposalSummary(row, deps);

    expect(summary).toEqual({
      id: row.id,
      status: 'pending',
      title: PROPOSAL_FIXTURE.title,
      category: 'creative',
      suggestedSlot: 'thu_eve',
      suggestedStartsAt: '2026-11-05T18:00:00.000Z',
      demand: PROPOSAL_FIXTURE.demand,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      resultingEventId: null,
    });
  });

  it('computes a start time when workstream 04 stored none', async () => {
    const row = store.seedProposal({
      ...PENDING_PROPOSAL(businessId),
      proposal: { ...PROPOSAL_FIXTURE, suggestedStartsAt: undefined },
    });
    // 2026-10-26 is a Monday; the next thu_eve at 18:00 UTC is 2026-10-29.
    expect(toProposalSummary(row, deps).suggestedStartsAt).toBe('2026-10-29T18:00:00.000Z');
  });

  it('reports no start time when the slot time is unusable', async () => {
    const row = store.seedProposal({
      ...PENDING_PROPOSAL(businessId),
      proposal: { ...PROPOSAL_FIXTURE, suggestedStartsAt: undefined, suggestedStartTimeLocal: 'later' },
    });
    expect(toProposalSummary(row, deps).suggestedStartsAt).toBeNull();
  });

  it('lists only this venue proposals, newest first', async () => {
    const other = store.seedBusiness({ owner_id: 'owner-2', slug: 'other' }).business.id;
    store.seedProposal({ ...PENDING_PROPOSAL(other), created_at: '2026-10-26T10:00:00.000Z' });
    store.seedProposal({ ...PENDING_PROPOSAL(businessId), created_at: '2026-10-24T10:00:00.000Z' });
    store.seedProposal({ ...PENDING_PROPOSAL(businessId), created_at: '2026-10-25T10:00:00.000Z' });

    const list = await listBusinessProposals(deps, businessId);
    expect(list.map((p) => p.createdAt)).toEqual([
      '2026-10-25T10:00:00.000Z',
      '2026-10-24T10:00:00.000Z',
    ]);
  });

  it('filters by status', async () => {
    store.seedProposal(PENDING_PROPOSAL(businessId));
    store.seedProposal({ ...PENDING_PROPOSAL(businessId), status: 'rejected' });

    expect(await listBusinessProposals(deps, businessId, 'pending')).toHaveLength(1);
    expect(await listBusinessProposals(deps, businessId, 'rejected')).toHaveLength(1);
    expect(await listBusinessProposals(deps, businessId)).toHaveLength(2);
  });

  it('counts the pending ones for the nav badge', async () => {
    store.seedProposal(PENDING_PROPOSAL(businessId));
    store.seedProposal(PENDING_PROPOSAL(businessId));
    store.seedProposal({ ...PENDING_PROPOSAL(businessId), status: 'approved' });
    expect(await countPendingProposals(deps, businessId)).toBe(2);
  });

  it('returns the full document on the detail read', async () => {
    const row = store.seedProposal(PENDING_PROPOSAL(businessId));
    const detail = await getBusinessProposal(deps, businessId, row.id);
    expect(detail.proposal.assumptionsToValidate).toEqual(PROPOSAL_FIXTURE.assumptionsToValidate);
    expect(detail.businessEdits).toBeNull();
  });

  it('hides another venue proposal behind NOT_FOUND', async () => {
    const other = store.seedBusiness({ owner_id: 'owner-2', slug: 'other' }).business.id;
    const row = store.seedProposal(PENDING_PROPOSAL(other));
    try {
      await getBusinessProposal(deps, businessId, row.id);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as ApiError).code).toBe('NOT_FOUND');
    }
  });

  it('reports a missing proposal as NOT_FOUND', async () => {
    try {
      await getBusinessProposal(deps, businessId, 'prop-missing');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as ApiError).code).toBe('NOT_FOUND');
    }
  });
});
