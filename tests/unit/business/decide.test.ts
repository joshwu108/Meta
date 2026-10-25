import { beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '@/lib/api/errors';
import { decideProposal } from '@/features/proposals/server/decide';
import { toCapabilities } from '@/features/business/server/businesses';
import type { VenueContext } from '@/features/business/server/events';
import { MemoryBusinessStore } from '../../support/memory-store';
import { PENDING_PROPOSAL, testDeps, type TestDeps } from '../../support/fixtures';

/** Spec section 5 (Proposal decision), section 9 and section 10 criteria 2 and 4. */
describe('decideProposal', () => {
  let store: MemoryBusinessStore;
  let deps: TestDeps;
  let businessId: string;
  let venue: VenueContext;
  let proposalId: string;

  beforeEach(() => {
    store = new MemoryBusinessStore();
    const seeded = store.seedBusiness({ owner_id: 'owner-1' });
    businessId = seeded.business.id;
    venue = { capabilities: toCapabilities(seeded.capabilities), hours: seeded.business.hours };
    store.seedCluster('cluster-1', ['user-a', 'user-b', 'user-c']);
    proposalId = store.seedProposal(PENDING_PROPOSAL(businessId)).id;
    deps = testDeps(store);
  });

  const codeOf = async (fn: () => Promise<unknown>): Promise<string | undefined> => {
    try {
      await fn();
    } catch (err) {
      return (err as ApiError).code;
    }
    return undefined;
  };

  it('approving as-is creates an approved_draft event linked to the proposal', async () => {
    const { proposal, event } = await decideProposal(deps, businessId, venue, proposalId, {
      decision: 'approve',
      publish: false,
    });

    expect(proposal.status).toBe('approved');
    expect(event).not.toBeNull();
    expect(event?.status).toBe('approved_draft');
    expect(event?.source).toBe('ai_proposal');
    expect(event?.proposalId).toBe(proposalId);
    expect(proposal.resultingEventId).toBe(event?.id);
    expect(event?.priceCents).toBe(2000);
    expect(event?.capacity).toBe(8);
  });

  it('records the decision as an agent action', async () => {
    await decideProposal(deps, businessId, venue, proposalId, { decision: 'approve', publish: false });
    expect(deps.actions.map((a) => a.action)).toContain('approve_proposal');
  });

  it('edit & approve stores the edits and applies them to the event', async () => {
    const { proposal, event } = await decideProposal(deps, businessId, venue, proposalId, {
      decision: 'modify',
      edits: { priceCents: 2500, startsAt: '2026-11-05T18:30:00.000Z' },
      publish: false,
    });

    expect(proposal.status).toBe('modified');
    expect(proposal.businessEdits).toEqual({ priceCents: 2500, startsAt: '2026-11-05T18:30:00.000Z' });
    expect(event?.priceCents).toBe(2500);
    expect(event?.startsAt).toBe('2026-11-05T18:30:00.000Z');
    // The proposed duration is preserved when only the start moves.
    expect(event?.endsAt).toBe('2026-11-05T20:15:00.000Z');
  });

  it('publishes immediately when asked and notifies the originating cohort', async () => {
    const { event } = await decideProposal(deps, businessId, venue, proposalId, {
      decision: 'approve',
      publish: true,
    });

    expect(event?.status).toBe('published');
    expect(event?.publishedAt).not.toBeNull();
    expect(deps.notifications.map((n) => n.userId).sort()).toEqual(['user-a', 'user-b', 'user-c']);
    expect(new Set(deps.notifications.map((n) => n.type))).toEqual(new Set(['event_published']));
  });

  it('never puts a cohort member id or a raw count in the response', async () => {
    const result = await decideProposal(deps, businessId, venue, proposalId, {
      decision: 'approve',
      publish: true,
    });
    const serialized = JSON.stringify(result);
    for (const id of ['user-a', 'user-b', 'user-c', 'cluster-1']) {
      expect(serialized).not.toContain(id);
    }
    expect(serialized).toContain('6-9');
  });

  it('rejecting keeps the reason and creates no event', async () => {
    const { proposal, event } = await decideProposal(deps, businessId, venue, proposalId, {
      decision: 'reject',
      reason: 'staffing',
      note: 'No second potter that evening',
      publish: false,
    });

    expect(proposal.status).toBe('rejected');
    expect(proposal.decisionNote).toBe('staffing: No second potter that evening');
    expect(event).toBeNull();
    expect(store.snapshotEvents()).toHaveLength(0);
  });

  it('refuses a second decision on the same proposal', async () => {
    await decideProposal(deps, businessId, venue, proposalId, { decision: 'approve', publish: false });
    expect(
      await codeOf(() =>
        decideProposal(deps, businessId, venue, proposalId, { decision: 'reject', reason: 'other', publish: false }),
      ),
    ).toBe('CONFLICT');
  });

  it('hides another owner proposal behind NOT_FOUND', async () => {
    const other = store.seedBusiness({ owner_id: 'owner-2', slug: 'other-venue' });
    expect(
      await codeOf(() =>
        decideProposal(deps, other.business.id, venue, proposalId, { decision: 'approve', publish: false }),
      ),
    ).toBe('NOT_FOUND');
  });

  it('rejects edits the venue cannot host', async () => {
    expect(
      await codeOf(() =>
        decideProposal(deps, businessId, venue, proposalId, {
          decision: 'modify',
          edits: { capacity: 40 },
          publish: false,
        }),
      ),
    ).toBe('VALIDATION');
    expect(store.snapshotEvents()).toHaveLength(0);
    expect((await store.findProposal(proposalId))?.status).toBe('pending');
  });

  it('rolls the whole decision back when the transaction fails', async () => {
    store.failAfterProposalUpdate = 'simulated failure after the proposal update';

    await expect(
      decideProposal(deps, businessId, venue, proposalId, { decision: 'approve', publish: false }),
    ).rejects.toThrow(/simulated failure/);

    expect((await store.findProposal(proposalId))?.status).toBe('pending');
    expect((await store.findProposal(proposalId))?.resulting_event_id).toBeNull();
    expect(store.snapshotEvents()).toHaveLength(0);
  });

  it('fails loudly if the transaction reports an approval with no event', async () => {
    // A store that breaks its own contract must not leave the caller believing the event
    // exists; the route turns this into INTERNAL rather than a half-published proposal.
    // Shadow the one method on the instance; beforeEach builds a fresh store anyway.
    store.decideProposal = async () => ({ proposalId, status: 'approved', eventId: null });

    expect(
      await codeOf(() =>
        decideProposal(deps, businessId, venue, proposalId, { decision: 'approve', publish: false }),
      ),
    ).toBe('INTERNAL');
  });

  it('does not notify anyone when the proposal has no cluster', async () => {
    const orphan = store.seedProposal(PENDING_PROPOSAL(businessId, null)).id;
    await decideProposal(deps, businessId, venue, orphan, { decision: 'approve', publish: true });
    expect(deps.notifications).toEqual([]);
  });
});
