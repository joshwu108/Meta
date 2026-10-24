import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { reviseProposal, ReviseRequest } = await import('@/features/demand/server/revise');
const { thresholdAndRank } = await import('@/features/demand/server/aggregate');
const { clusterUsers, filterUsers } = await import('@/features/demand/server/cluster');
const { DEMAND_CONFIG } = await import('@/features/demand/server/config');
const { validateProposal } = await import('@/features/demand/server/validate');
const { ProposalDocument } = await import('@/features/demand/schemas');
const fixture = (await import('@/lib/ai/fixtures/demand.generate_proposal.json')).default;
const { consentingUsers, NOW, VENUES } = await import('./harness');
const { ApiError } = await import('@/lib/api/errors');

type Deps = Parameters<typeof reviseProposal>[2];

const cluster = thresholdAndRank(clusterUsers(filterUsers(consentingUsers()), DEMAND_CONFIG), DEMAND_CONFIG).kept.find((c) => c.category === 'creative' && c.slot === 'thu_eve')!;
const kiln = VENUES[0]!;
const doc = ProposalDocument.parse(fixture);
const stored = (() => {
  const r = validateProposal(doc, cluster, kiln, NOW, DEMAND_CONFIG);
  if (!r.ok) throw new Error('fixture invalid');
  return r.proposal;
})();

function deps(overrides: Partial<Deps> = {}) {
  const appended: unknown[][] = [];
  const d: Deps = {
    config: DEMAND_CONFIG,
    now: () => NOW,
    loadProposal: async () => ({ id: 'p1', status: 'pending', business_id: 'b-kiln', proposal: stored, business_edits: null, cluster }),
    loadVenue: async () => kiln,
    generate: vi.fn(async () => doc),
    appendRevision: async (_id, revisions) => {
      appended.push([...revisions]);
    },
    ...overrides,
  };
  return { d, appended };
}

async function expectCode(p: Promise<unknown>, code: string) {
  const e = await p.catch((x: unknown) => x);
  expect(e).toBeInstanceOf(ApiError);
  expect((e as InstanceType<typeof ApiError>).code).toBe(code);
}

describe('reviseProposal', () => {
  it('applies the owner price over the model and appends a revision', async () => {
    const { d, appended } = deps();
    const out = await reviseProposal('p1', { priceCents: 2500, note: 'Bump to $25' }, d);
    expect(out.revision.suggestedPriceCents).toBe(2500);
    expect(out.revision.demand.band).toBe('6-9');
    expect(out.revisionCount).toBe(1);
    expect(appended[0]).toHaveLength(1);
    const call = vi.mocked(d.generate).mock.calls[0]?.[0];
    expect(call?.revision.request).toEqual({ priceCents: 2500, note: 'Bump to $25' });
    expect(JSON.stringify(call)).not.toMatch(/userId|members/);
  });

  it('revises the latest revision, not the original', async () => {
    const earlier = { at: NOW.toISOString(), request: { priceCents: 2200 }, proposal: { ...stored, suggestedPriceCents: 2200 } };
    const { d } = deps({ loadProposal: async () => ({ id: 'p1', status: 'pending', business_id: 'b-kiln', proposal: stored, business_edits: { revisions: [earlier] }, cluster }) });
    const out = await reviseProposal('p1', { note: 'More beginner focus' }, d);
    expect(vi.mocked(d.generate).mock.calls[0]?.[0].revision.current.suggestedPriceCents).toBe(2200);
    expect(out.revisionCount).toBe(2);
  });

  it('rejects numbers that break venue constraints', async () => {
    const { d, appended } = deps();
    await expectCode(reviseProposal('p1', { capacity: 40 }, d), 'VALIDATION');
    await expectCode(reviseProposal('p1', { priceCents: 9000 }, d), 'VALIDATION');
    expect(appended).toHaveLength(0);
  });

  it('allows a slot change the venue hosts', async () => {
    const { d } = deps();
    const out = await reviseProposal('p1', { slot: 'sat_day' }, d);
    expect(out.revision.suggestedSlot).toBe('sat_day');
  });

  it('404s when the caller cannot see the proposal and 409s once decided', async () => {
    await expectCode(reviseProposal('p1', { note: 'x' }, deps({ loadProposal: async () => null }).d), 'NOT_FOUND');
    const decided = deps({ loadProposal: async () => ({ id: 'p1', status: 'approved', business_id: 'b-kiln', proposal: stored, business_edits: null, cluster }) });
    await expectCode(reviseProposal('p1', { note: 'x' }, decided.d), 'CONFLICT');
  });

  it('requires a note or a change', () => {
    expect(ReviseRequest.safeParse({}).success).toBe(false);
    expect(ReviseRequest.safeParse({ note: 'ok' }).success).toBe(true);
    expect(ReviseRequest.safeParse({ owner: 'x' }).success).toBe(false);
  });
});
