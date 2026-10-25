import { describe, expect, it, vi } from 'vitest';
import type { ProposalDocument, ReviseProposalRequest, StoredProposal } from '@/features/demand/schemas';
import { DEMAND_CONFIG } from '@/features/demand/server/config';
import type { RevisableProposal, ReviseDeps, ReviseInput } from '@/features/demand/server/revise';
import fixture from '@/lib/ai/fixtures/demand.generate_proposal.json';
import revisedFixture from '@/lib/ai/fixtures/demand.revise_proposal.json';
import { NOW, VENUES } from './harness';

vi.mock('server-only', () => ({}));

const { applyOverrides, reviseProposal } = await import('@/features/demand/server/revise');
const { handleRevise } = await import('@/features/demand/server/revise-route');
const { ApiError } = await import('@/lib/api');

const KILN = VENUES[0]!;
const STORED: StoredProposal = { ...(fixture as ProposalDocument), disclaimers: ['demand_is_estimate'], suggestedStartsAt: '2026-11-06T02:00:00.000Z', attendanceEstimate: { min: 3, max: 8, confidence: 'medium' } };
const REVISED = { ...(revisedFixture as ProposalDocument), disclaimers: ['demand_is_estimate'] } as ProposalDocument;

function row(overrides: Partial<RevisableProposal> = {}): RevisableProposal {
  return { id: '11111111-1111-1111-1111-111111111111', status: 'pending', businessId: 'b-kiln', revision: 0, proposal: STORED, budgetP50Cents: 2000, ...overrides };
}

function deps(overrides: Partial<ReviseDeps> = {}) {
  const saved: Parameters<ReviseDeps['saveRevision']>[0][] = [];
  const inputs: ReviseInput[] = [];
  const d: ReviseDeps = {
    config: DEMAND_CONFIG,
    now: () => NOW,
    loadVenue: async (id) => VENUES.find((v) => v.match.businessId === id) ?? null,
    generate: async (input) => {
      inputs.push(input);
      return REVISED;
    },
    saveRevision: async (input) => {
      saved.push(input);
      return 'p-rev-1';
    },
    logActions: vi.fn(async () => undefined),
    ...overrides,
  };
  return { deps: d, saved, inputs };
}

describe('reviseProposal', () => {
  it('stores a validated revision that keeps the demand block and recomputes the start', async () => {
    const { deps: d, saved, inputs } = deps();
    const outcome = await reviseProposal(row(), { note: 'Smaller group please', capacity: 8 }, d);
    expect(outcome.kind).toBe('revised');
    expect(saved).toHaveLength(1);
    const stored = saved[0]!.proposal;
    expect(stored.suggestedCapacity).toBe(8);
    expect(stored.demand).toEqual(STORED.demand);
    expect(stored.disclaimers).toEqual(['demand_is_estimate']);
    expect(new Date(stored.suggestedStartsAt).getTime() - NOW.getTime()).toBeGreaterThanOrEqual(5 * 86_400_000);
    expect(inputs[0]).toMatchObject({ ownerNote: 'Smaller group please', changes: { capacity: 8, priceCents: null, slot: null } });
    expect(inputs[0]?.previous).not.toHaveProperty('suggestedStartsAt');
    expect(inputs[0]?.previous).not.toHaveProperty('attendanceEstimate');
    expect(stored.attendanceEstimate).toEqual({ min: 3, max: 8, confidence: 'medium' });
  });

  it('applies owner numbers even when the model ignores them', async () => {
    const { deps: d, saved } = deps({ generate: async () => ({ ...REVISED, suggestedCapacity: 12, suggestedPriceCents: 1500 }) });
    await reviseProposal(row(), { capacity: 6, priceCents: 4000 }, d);
    expect(saved[0]?.proposal).toMatchObject({ suggestedCapacity: 6, suggestedPriceCents: 4000 });
  });

  it('accepts an owner slot outside the listed hosting slots and moves the start to it', async () => {
    const { deps: d, saved } = deps({ generate: async () => REVISED });
    const outcome = await reviseProposal(row(), { slot: 'fri_eve' }, d);
    expect(outcome.kind).toBe('revised');
    const startsAt = new Date(saved[0]!.proposal.suggestedStartsAt);
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' }).format(startsAt);
    expect(saved[0]?.proposal.suggestedSlot).toBe('fri_eve');
    expect(weekday).toBe('Fri');
  });

  it('refuses a capacity above the venue before calling the model', async () => {
    const generate = vi.fn(async () => REVISED);
    const outcome = await reviseProposal(row(), { capacity: 40 }, deps({ generate }).deps);
    expect(outcome).toEqual({ kind: 'over_capacity', capacity: KILN.capabilities.capacity });
    expect(generate).not.toHaveBeenCalled();
  });

  it('refuses decided proposals and the revision limit', async () => {
    expect((await reviseProposal(row({ status: 'approved' }), { note: 'x' }, deps().deps)).kind).toBe('not_pending');
    expect((await reviseProposal(row({ revision: 3 }), { note: 'x' }, deps().deps)).kind).toBe('limit_reached');
    expect((await reviseProposal(row({ businessId: 'gone' }), { note: 'x' }, deps().deps)).kind).toBe('no_venue');
  });

  it('regenerates once with feedback on a forbidden phrase, then rejects', async () => {
    const bad = { ...REVISED, description: `${REVISED.description} Eight people are confirmed.` };
    const generate = vi.fn(async (_input: ReviseInput) => bad);
    const { deps: d, saved } = deps({ generate });
    const outcome = await reviseProposal(row(), { note: 'x' }, d);
    expect(outcome).toEqual({ kind: 'rejected', issues: ['forbidden_phrase'] });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0].feedback).toContain('forbidden_phrase');
    expect(saved).toHaveLength(0);
  });

  it('reports a model failure without saving', async () => {
    const { deps: d, saved } = deps({ generate: async () => { throw new Error('down'); } });
    expect((await reviseProposal(row(), { note: 'x' }, d)).kind).toBe('llm_failure');
    expect(saved).toHaveLength(0);
  });

  it('applyOverrides leaves unspecified fields alone', () => {
    const req: ReviseProposalRequest = { note: 'warmer tone' };
    expect(applyOverrides(REVISED, req)).toEqual(REVISED);
  });
});

describe('POST /api/ai/proposals/:id/revise', () => {
  const ID = '11111111-1111-1111-1111-111111111111';
  const ctx = { user: { id: 'owner-b-kiln' }, supabase: {} as never };
  const post = (body: unknown) => new Request(`http://test/api/ai/proposals/${ID}/revise`, { method: 'POST', body: JSON.stringify(body) });

  function routeDeps(found: RevisableProposal | null = row(), reviseDeps = deps().deps) {
    return { revise: () => reviseDeps, loadRevisable: vi.fn(async () => found), limit: vi.fn() };
  }

  async function code(promise: Promise<unknown>) {
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    return (error as InstanceType<typeof ApiError>).code;
  }

  it('returns 201 with the new proposal and what it supersedes', async () => {
    const r = routeDeps();
    const res = await handleRevise(ctx, ID, post({ note: 'smaller', capacity: 8 }), r);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { proposalId: string; supersedes: string; revision: number } };
    expect(body.data).toMatchObject({ proposalId: 'p-rev-1', supersedes: ID, revision: 1 });
    expect(r.limit).toHaveBeenCalledWith('owner-b-kiln');
  });

  it('validates the id and body', async () => {
    expect(await code(handleRevise(ctx, 'nope', post({ note: 'x' }), routeDeps()))).toBe('VALIDATION');
    expect(await code(handleRevise(ctx, ID, post({}), routeDeps()))).toBe('VALIDATION');
    expect(await code(handleRevise(ctx, ID, post({ note: 'x', userId: 'u' }), routeDeps()))).toBe('VALIDATION');
  });

  it('hides proposals the caller does not own', async () => {
    expect(await code(handleRevise(ctx, ID, post({ note: 'x' }), routeDeps(null)))).toBe('NOT_FOUND');
  });

  it('maps outcomes to envelope errors', async () => {
    expect(await code(handleRevise(ctx, ID, post({ note: 'x' }), routeDeps(row({ status: 'rejected' }))))).toBe('CONFLICT');
    expect(await code(handleRevise(ctx, ID, post({ capacity: 50 }), routeDeps()))).toBe('VALIDATION');
    const down = deps({ generate: async () => { throw new Error('down'); } }).deps;
    expect(await code(handleRevise(ctx, ID, post({ note: 'x' }), routeDeps(row(), down)))).toBe('AI_UNAVAILABLE');
  });
});
