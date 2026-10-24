import { describe, expect, it, vi } from 'vitest';
import type { GenerateInput } from '@/features/demand/server/deps';
import type { GroupDeps, GroupVenueRequest } from '@/features/demand/server/group';
import { makeDeps } from './harness';

vi.mock('server-only', () => ({}));

const { proposeForGroup } = await import('@/features/demand/server/group');
const { handleGenerate } = await import('@/features/demand/server/routes');
const { ApiError } = await import('@/lib/api');

const GROUP = '22222222-2222-2222-2222-222222222222';
const PLAN = '33333333-3333-3333-3333-333333333333';

const request = (overrides: Partial<GroupVenueRequest> = {}): GroupVenueRequest => ({
  groupId: GROUP, planId: PLAN, suggestionIndex: 1, title: 'Wheel-throwing night', description: 'Try the pottery wheel together',
  category: 'creative', slot: 'thu_eve', estimatedCostCents: 2500, memberCount: 6, votes: 4, groupSizeMode: 'small',
  budgetMaxCents: 3000, activityPrefs: ['hands-on'], neighborhoodLabel: 'Mission District', centerLat: 37.76, centerLng: -122.42,
  ...overrides,
});

function groupDeps(overrides: Partial<GroupDeps> = {}) {
  const { deps } = makeDeps();
  const generate = vi.fn(deps.generate);
  const saved: Parameters<GroupDeps['saveGroupProposal']>[0][] = [];
  const d: GroupDeps = {
    config: deps.config, now: deps.now, findCandidates: deps.findCandidates, loadVenue: deps.loadVenue,
    generate, notify: deps.notify, logActions: deps.logActions,
    hasPendingGroupProposal: async () => false,
    saveGroupProposal: async (input) => {
      saved.push(input);
      return 'p-group-1';
    },
    ...overrides,
  };
  return { deps: d, saved, generate };
}

describe('proposeForGroup', () => {
  it('drafts a pending proposal for the best venue from the voted idea', async () => {
    const { deps, saved, generate } = groupDeps();
    const outcome = await proposeForGroup(request(), deps);
    expect(outcome.kind).toBe('created');
    expect(saved[0]?.key).toEqual({ groupId: GROUP, planId: PLAN, suggestionIndex: 1 });
    expect(saved[0]?.businessId).toBe('b-kiln');
    expect(saved[0]?.proposal.demand).toEqual({ band: '6-9', neighborhoodLabel: 'Mission District', topInterests: [] });
    const input = generate.mock.calls[0]?.[0] as GenerateInput;
    expect(input.groupIdea).toEqual({ title: 'Wheel-throwing night', description: 'Try the pottery wheel together' });
    expect(input.brief).toMatchObject({ demandBand: '6-9', budgetP50Cents: 2000, activityPrefs: ['hands-on'] });
    expect(deps.notify).toHaveBeenCalledWith('owner-b-kiln', 'proposal_received', expect.objectContaining({ proposalId: 'p-group-1', demandBand: '6-9' }));
    expect(deps.logActions).toHaveBeenCalledWith([expect.objectContaining({ action: 'generate_proposal', permissionsUsed: ['group_plan'] })]);
  });

  it('never materializes a group below the cohort minimum (AC3)', async () => {
    const findCandidates = vi.fn(async () => []);
    const { deps, saved } = groupDeps({ findCandidates });
    expect(await proposeForGroup(request({ memberCount: 3 }), deps)).toEqual({ kind: 'too_small', minimum: deps.config.minCohortSize });
    expect(findCandidates).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
  });

  it('needs a shared location to match a venue', async () => {
    const { deps } = groupDeps();
    expect((await proposeForGroup(request({ centerLat: null, centerLng: null, neighborhoodLabel: null }), deps)).kind).toBe('no_location');
  });

  it('sends one pending proposal per suggestion', async () => {
    const { deps, generate } = groupDeps({ hasPendingGroupProposal: async () => true });
    expect((await proposeForGroup(request(), deps)).kind).toBe('duplicate');
    expect(generate).not.toHaveBeenCalled();
  });

  it('treats losing the insert race as a duplicate and notifies nobody', async () => {
    const { deps } = groupDeps({ saveGroupProposal: async () => null });
    expect((await proposeForGroup(request(), deps)).kind).toBe('duplicate');
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('reports unmatched when no venue supports the category nearby', async () => {
    const { deps } = groupDeps();
    expect((await proposeForGroup(request({ category: 'games', centerLat: 37.6, centerLng: -122.6 }), deps)).kind).toBe('unmatched');
  });

  it('isolates a model failure', async () => {
    const { deps, saved } = groupDeps({ generate: async () => { throw new Error('down'); } });
    expect((await proposeForGroup(request(), deps)).kind).toBe('llm_failure');
    expect(saved).toHaveLength(0);
  });
});

describe('POST /api/ai/generate-opportunities { source: group }', () => {
  const ctx = { user: { id: 'member-1' }, supabase: {} as never };
  const post = (body: unknown) => new Request('http://test/api/ai/generate-opportunities', { method: 'POST', body: JSON.stringify(body) });
  const body = { source: 'group', groupId: GROUP, planId: PLAN, suggestionIndex: 1 };

  function routeDeps(group: Partial<NonNullable<Parameters<typeof handleGenerate>[2]['group']>> | null = {}) {
    const { deps: pipeline } = makeDeps();
    const g = group === null ? undefined : {
      isActiveMember: vi.fn(async () => true),
      getRequest: vi.fn(async () => request()),
      propose: () => groupDeps().deps,
      limit: vi.fn(),
      ...group,
    };
    return {
      pipeline: () => pipeline, isDemoMode: () => false, schedule: () => undefined,
      getRunView: async () => null, cronSecret: () => undefined, group: g,
    };
  }

  async function code(promise: Promise<unknown>) {
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    return (error as InstanceType<typeof ApiError>).code;
  }

  it('lets an active member (not an operator) request a venue', async () => {
    const deps = routeDeps();
    const res = await handleGenerate(ctx, post(body), deps);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, data: { proposalId: 'p-group-1', businessName: 'Kiln & Cup' } });
    expect(deps.group?.limit).toHaveBeenCalledWith('member-1');
  });

  it('refuses non-members and ineligible ideas', async () => {
    expect(await code(handleGenerate(ctx, post(body), routeDeps({ isActiveMember: async () => false })))).toBe('FORBIDDEN');
    expect(await code(handleGenerate(ctx, post(body), routeDeps({ getRequest: async () => null })))).toBe('VALIDATION');
  });

  it('validates the body and maps outcomes', async () => {
    expect(await code(handleGenerate(ctx, post({ ...body, memberIds: ['x'] }), routeDeps()))).toBe('VALIDATION');
    expect(await code(handleGenerate(ctx, post({ ...body, groupId: 'nope' }), routeDeps()))).toBe('VALIDATION');
    const dup = routeDeps({ propose: () => groupDeps({ hasPendingGroupProposal: async () => true }).deps });
    expect(await code(handleGenerate(ctx, post(body), dup))).toBe('CONFLICT');
    expect(await code(handleGenerate(ctx, post(body), routeDeps(null)))).toBe('INTERNAL');
  });

  it('still requires an operator for demand runs', async () => {
    const maybeSingle = async () => ({ data: { is_operator: false }, error: null });
    const opCtx = { user: { id: 'u' }, supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) } as never };
    expect(await code(handleGenerate(opCtx, post({ source: 'demand' }), routeDeps()))).toBe('FORBIDDEN');
  });
});
