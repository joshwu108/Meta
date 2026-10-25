import { describe, expect, it, vi } from 'vitest';
import type { PipelineDeps } from '@/features/demand/server/deps';

vi.mock('server-only', () => ({}));

const { runPipeline, PipelineBusyError } = await import('@/features/demand/server/pipeline');
const { ProposalDocument } = await import('@/features/demand/schemas');
const fixture = (await import('@/lib/ai/fixtures/demand.generate_proposal.json')).default;
const { consentingUsers, makeDeps, OPTED_OUT_ID, scene3Users } = await import('./harness');
const { templateProposal } = await import('@/features/demand/server/generate');

type GenerateFn = Parameters<typeof makeDeps>[0] extends infer O ? NonNullable<O extends { generate?: infer G } ? G : never> : never;

/** Scene 3 fixture for the pottery brief, template for everything else (like MOCK_AI). */
const scene3Generate: GenerateFn = async (input) =>
  input.brief.category === 'creative' && input.brief.slot === 'thu_eve' ? ProposalDocument.parse(fixture) : templateProposal(input);

describe('runPipeline (Scene 3 data)', () => {
  it('routes the pottery cohort to Kiln & Cup and the board-game cohort to Meeple House', async () => {
    const { deps, saved } = makeDeps({ generate: scene3Generate });
    const result = await runPipeline(deps, { triggeredBy: 'manual' });
    const pottery = saved.find((s) => s.cluster.category === 'creative' && s.cluster.slot === 'thu_eve');
    const games = saved.find((s) => s.cluster.category === 'games' && s.cluster.slot === 'fri_eve');
    expect(pottery?.venue.card.name).toBe('Kiln & Cup');
    expect(pottery?.proposal.title).toBe('Beginner Pottery & Coffee Night');
    expect(pottery?.proposal.demand.band).toBe('6-9');
    expect(pottery?.proposal.assumptionsToValidate.length).toBeGreaterThan(0);
    expect(games?.venue.card.name).toBe('Meeple House');
    expect(saved.filter((s) => s.cluster.category === 'creative' && s.cluster.slot === 'thu_eve')).toHaveLength(1);
    expect(result.stats.proposalsCreated).toBe(saved.length);
    expect(deps.notify).toHaveBeenCalledWith('owner-b-kiln', 'proposal_received', expect.objectContaining({ demandBand: '6-9', href: expect.stringMatching(/^\/business\/proposals\/p-\d+$/) }));
  });

  it('never counts the opted-out user', async () => {
    const { deps, saved } = makeDeps({ generate: scene3Generate });
    await runPipeline(deps, { triggeredBy: 'manual' });
    expect(saved.length).toBeGreaterThan(0);
    expect(saved.every((s) => s.cluster.members.every((m) => m.userId !== OPTED_OUT_ID))).toBe(true);
    const logged = vi.mocked(deps.logActions).mock.calls.flatMap((c) => c[0]).filter((e) => e.action === 'collect_signals');
    expect(logged.map((e) => e.userId)).not.toContain(OPTED_OUT_ID);
    expect(logged).toHaveLength(13);
  });

  it('reads preferences in id batches so large cities stay under the URL limit', async () => {
    const { deps: base } = makeDeps();
    const real = await base.listEligibleUserIds();
    const extra = Array.from({ length: 236 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
    const getSharableBatch = vi.fn(base.getSharableBatch);
    const { deps, saved } = makeDeps({ listEligibleUserIds: async () => [...extra, ...real], getSharableBatch });
    await runPipeline(deps, { triggeredBy: 'manual' });
    const sizes = getSharableBatch.mock.calls.map(([ids]) => ids.length);
    expect(sizes).toEqual([100, 100, 50]);
    expect(saved.length).toBeGreaterThan(0);
  });

  it("never counts 02's demand opt-outs (02 AC3, shared fixture)", async () => {
    const { DEMAND_OPT_OUT_EMAILS } = await import('../../fixtures/consent-cases');
    const rows = (await import('../../fixtures/demand/users-scene3.json')).default as Array<{ email: string; allowDemandAggregation: boolean; preferences: { userId: string } }>;
    expect(rows.filter((r) => !r.allowDemandAggregation).map((r) => r.email).sort()).toEqual([...DEMAND_OPT_OUT_EMAILS].sort());
    const optedOut = new Set(rows.filter((r) => DEMAND_OPT_OUT_EMAILS.includes(r.email)).map((r) => r.preferences.userId));
    const { deps, saved } = makeDeps({ generate: scene3Generate });
    await runPipeline(deps, { triggeredBy: 'manual' });
    expect(optedOut.size).toBe(DEMAND_OPT_OUT_EMAILS.length);
    expect(saved.length).toBeGreaterThan(0);
    expect(saved.flatMap((s) => s.cluster.members).filter((m) => optedOut.has(m.userId))).toEqual([]);
  });

  it('drops a user the consent boundary withholds, though they would fit a cohort', async () => {
    const member = consentingUsers().find((u) => u.interestCategories.includes('creative') && u.availabilitySlots.includes('thu_eve'))!;
    const twin = { ...member, userId: 'twin-user' };
    const creative = (list: Parameters<PipelineDeps['saveProposal']>[0][]) => list.find((x) => x.cluster.category === 'creative' && x.cluster.slot === 'thu_eve');
    const run = async (withheld: boolean) => {
      const users = withheld ? consentingUsers() : [...consentingUsers(), twin];
      const { deps, saved } = makeDeps({
        generate: scene3Generate,
        listEligibleUserIds: async () => [...scene3Users().map((u) => u.userId), twin.userId],
        getSharableBatch: async (ids) => new Map(users.filter((u) => ids.includes(u.userId)).map((u) => [u.userId, u])),
      });
      await runPipeline(deps, { triggeredBy: 'manual' });
      const logged = vi.mocked(deps.logActions).mock.calls.flatMap((c) => c[0]).map((e) => e.userId);
      return { members: creative(saved)?.cluster.members.map((m) => m.userId) ?? [], logged };
    };
    const consented = await run(false);
    expect(consented.members).toContain('twin-user');
    expect(consented.logged).toContain('twin-user');
    const withheld = await run(true);
    expect(withheld.members.length).toBeGreaterThan(0);
    expect(withheld.members).not.toContain('twin-user');
    expect(withheld.logged).not.toContain('twin-user');
  });

  it('creates nothing new on a second run within the dedup window', async () => {
    const { deps, saved } = makeDeps({ generate: scene3Generate });
    await runPipeline(deps, { triggeredBy: 'manual' });
    const first = saved.length;
    const second = await runPipeline(deps, { triggeredBy: 'manual' });
    expect(saved.length).toBe(first);
    expect(second.stats.proposalsCreated).toBe(0);
    expect(second.stats.skippedDuplicate).toBe(first);
  });

  it('isolates an LLM failure to its cluster and reports it', async () => {
    const generate: GenerateFn = async (input) => {
      if (input.brief.category === 'games') throw new Error('model down');
      return scene3Generate(input);
    };
    const { deps, saved } = makeDeps({ generate });
    const result = await runPipeline(deps, { triggeredBy: 'manual' });
    expect(result.stats.llmFailures).toBeGreaterThanOrEqual(1);
    expect(saved.some((s) => s.venue.card.name === 'Kiln & Cup')).toBe(true);
  });

  it('regenerates once on a validator failure, then rejects the cluster', async () => {
    const bad = { ...ProposalDocument.parse(fixture), description: `${fixture.description} Ten people are guaranteed.` };
    const generate = vi.fn<GenerateFn>(async (input) => (input.brief.category === 'creative' && input.brief.slot === 'thu_eve' ? bad : templateProposal(input)));
    const { deps, saved } = makeDeps({ generate });
    const result = await runPipeline(deps, { triggeredBy: 'manual' });
    const potteryCalls = generate.mock.calls.filter(([i]) => i.brief.category === 'creative' && i.brief.slot === 'thu_eve');
    expect(potteryCalls).toHaveLength(2);
    expect(potteryCalls[1]?.[0].feedback).toContain('forbidden_phrase');
    expect(result.stats.rejectedByValidator).toBeGreaterThanOrEqual(1);
    expect(saved.some((s) => s.cluster.category === 'creative' && s.cluster.slot === 'thu_eve')).toBe(false);
  });

  it('dry run drafts but stores and notifies nothing', async () => {
    const { deps, saved } = makeDeps({ generate: scene3Generate });
    const result = await runPipeline(deps, { triggeredBy: 'manual', dryRun: true });
    expect(saved).toHaveLength(0);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(result.outcomes.some((o) => o.outcome === 'drafted' && o.title === 'Beginner Pottery & Coffee Night')).toBe(true);
  });

  it('caps proposals per business per run', async () => {
    const { deps, saved } = makeDeps({ generate: scene3Generate, config: { ...makeDeps().deps.config, maxProposalsPerBusinessPerRun: 1 } });
    await runPipeline(deps, { triggeredBy: 'manual' });
    const perBusiness = saved.reduce((m, s) => m.set(s.venue.match.businessId, (m.get(s.venue.match.businessId) ?? 0) + 1), new Map<string, number>());
    expect(Math.max(...perBusiness.values())).toBe(1);
  });

  it('refuses to run while another run holds the lock', async () => {
    const { deps } = makeDeps({ startRun: async () => null });
    await expect(runPipeline(deps, { triggeredBy: 'cron' })).rejects.toBeInstanceOf(PipelineBusyError);
  });

  it('marks the run failed and rethrows on an unexpected error', async () => {
    const { deps } = makeDeps({ listEligibleUserIds: async () => { throw new Error('db down'); } });
    await expect(runPipeline(deps, { triggeredBy: 'manual' })).rejects.toThrow('db down');
    expect(deps.updateRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'failed', finished: true }));
  });
});
