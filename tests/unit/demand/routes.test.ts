import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { handleCron, handleGenerate, handleRunStatus } = await import('@/features/demand/server/routes');
const { ApiError } = await import('@/lib/api');
const { makeDeps } = await import('./harness');

type RouteDeps = Parameters<typeof handleGenerate>[2];

function ctx(isOperator: boolean) {
  const maybeSingle = vi.fn(async () => ({ data: { is_operator: isOperator }, error: null }));
  const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) };
  return { user: { id: 'u1' }, supabase: supabase as never };
}

function routeDeps(overrides: Partial<RouteDeps> = {}) {
  const tasks: Array<() => Promise<unknown>> = [];
  const { deps: pipeline, saved } = makeDeps();
  const deps: RouteDeps = {
    pipeline: () => pipeline,
    isDemoMode: () => false,
    schedule: (task) => tasks.push(task),
    getRunView: async () => ({ status: 'completed', stage: 'done', stats: { proposalsCreated: 1 }, proposals: [] }),
    cronSecret: () => 'shh',
    ...overrides,
  };
  return { deps, tasks, saved, pipeline };
}

const post = (body: unknown) => new Request('http://test/api/ai/generate-opportunities', { method: 'POST', body: JSON.stringify(body) });

async function expectApiError(promise: Promise<unknown>, code: string) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as InstanceType<typeof ApiError>).code).toBe(code);
}

describe('POST /api/ai/generate-opportunities', () => {
  it('requires an operator outside DEMO_MODE', async () => {
    const { deps } = routeDeps();
    await expectApiError(handleGenerate(ctx(false), post({}), deps), 'FORBIDDEN');
  });

  it('lets any signed-in user trigger in DEMO_MODE', async () => {
    const { deps, tasks } = routeDeps({ isDemoMode: () => true });
    const res = await handleGenerate(ctx(false), post({}), deps);
    expect(res.status).toBe(202);
    expect(tasks).toHaveLength(1);
  });

  it('returns the run id at once and finishes the run after the response', async () => {
    const { deps, tasks, saved } = routeDeps();
    const res = await handleGenerate(ctx(true), post({}), deps);
    expect(await res.json()).toEqual({ ok: true, data: { runId: 'run-1' } });
    expect(saved).toHaveLength(0);
    await tasks[0]?.();
    expect(saved.length).toBeGreaterThan(0);
  });

  it('honors dryRun', async () => {
    const { deps, tasks, saved } = routeDeps();
    await handleGenerate(ctx(true), post({ dryRun: true }), deps);
    await tasks[0]?.();
    expect(saved).toHaveLength(0);
  });

  it('rejects unknown body fields', async () => {
    const { deps } = routeDeps();
    await expectApiError(handleGenerate(ctx(true), post({ source: 'group' }), deps), 'VALIDATION');
  });

  it('returns CONFLICT while another run holds the lock', async () => {
    const { deps, pipeline } = routeDeps();
    const busy = { ...pipeline, startRun: async () => null };
    await expectApiError(handleGenerate(ctx(true), post({}), { ...deps, pipeline: () => busy }), 'CONFLICT');
  });
});

describe('GET /api/ai/opportunities/:runId', () => {
  it('returns the run view', async () => {
    const { deps } = routeDeps();
    const res = await handleRunStatus(ctx(true), '11111111-1111-4111-8111-111111111111', deps);
    expect(await res.json()).toMatchObject({ ok: true, data: { status: 'completed', stage: 'done' } });
  });

  it('validates the id and 404s unknown runs', async () => {
    const { deps } = routeDeps({ getRunView: async () => null });
    await expectApiError(handleRunStatus(ctx(true), 'nope', deps), 'VALIDATION');
    await expectApiError(handleRunStatus(ctx(true), '11111111-1111-4111-8111-111111111111', deps), 'NOT_FOUND');
  });
});

describe('GET /api/cron/opportunities', () => {
  const cron = (auth?: string) => new Request('http://test/api/cron/opportunities', { headers: auth ? { authorization: auth } : {} });

  it('rejects a missing or wrong secret, and always rejects when no secret is configured', async () => {
    const { deps } = routeDeps();
    await expectApiError(handleCron(cron(), deps), 'UNAUTHENTICATED');
    await expectApiError(handleCron(cron('Bearer wrong'), deps), 'UNAUTHENTICATED');
    await expectApiError(handleCron(cron('Bearer '), { ...deps, cronSecret: () => undefined }), 'UNAUTHENTICATED');
  });

  it('runs the pipeline with the right secret', async () => {
    const { deps, saved } = routeDeps();
    const res = await handleCron(cron('Bearer shh'), deps);
    const body = await res.json();
    expect(body.data.proposalsCreated).toBe(saved.length);
  });
});
