import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError, ok, parseBody } from '@/lib/api';
import { serverEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { GenerateOpportunitiesRequest } from '../schemas';
import type { PipelineDeps } from './deps';
import { executeRun, PipelineBusyError, runPipeline, startRun } from './pipeline';
import { ReviseRequest } from './revise';
import type { RunView } from './store-supabase';

/** Route handler logic, separated from Next's route files so it is testable without a server. */
export type RouteDeps = {
  pipeline: () => PipelineDeps;
  isDemoMode: () => boolean;
  /** Schedules work to finish after the response is sent (Next `after()`). */
  schedule: (task: () => Promise<unknown>) => void;
  getRunView: (runId: string) => Promise<RunView | null>;
  cronSecret: () => string | undefined;
};

type Ctx = { user: { id: string }; supabase: SupabaseClient };

/** DEMO_MODE lets any signed-in user run the pipeline; otherwise `profiles.is_operator` is required. */
export async function assertOperator(ctx: Ctx, deps: Pick<RouteDeps, 'isDemoMode'>): Promise<void> {
  if (deps.isDemoMode()) return;
  const { data, error } = await ctx.supabase.from('profiles').select('is_operator').eq('id', ctx.user.id).maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Could not check operator access', 500);
  if (!(data as { is_operator?: boolean } | null)?.is_operator) {
    throw new ApiError('FORBIDDEN', 'Only operators can generate opportunities', 403);
  }
}

const busy = () => new ApiError('CONFLICT', 'An opportunity run is already in progress', 409);

/** POST /api/ai/generate-opportunities → `{ runId }` at once; the run finishes after the response. */
export async function handleGenerate(ctx: Ctx, req: Request, deps: RouteDeps): Promise<Response> {
  await assertOperator(ctx, deps);
  const body = await parseBody(GenerateOpportunitiesRequest, req);
  const pipeline = deps.pipeline();
  let runId: string;
  try {
    runId = await startRun(pipeline, 'manual');
  } catch (error) {
    if (error instanceof PipelineBusyError) throw busy();
    throw error;
  }
  deps.schedule(() =>
    executeRun(pipeline, runId, { triggeredBy: 'manual', dryRun: body.dryRun }).catch((error: unknown) => {
      log.error('demand.run_failed', { runId, error });
    }),
  );
  return ok({ runId }, undefined, { status: 202 });
}

const RUN_ID = /^[0-9a-f-]{36}$/i;

/** GET /api/ai/opportunities/:runId → status, stats and the run's proposals (banded, no raw counts). */
export async function handleRunStatus(ctx: Ctx, runId: string | undefined, deps: RouteDeps): Promise<Response> {
  await assertOperator(ctx, deps);
  if (!runId || !RUN_ID.test(runId)) throw new ApiError('VALIDATION', 'runId must be a uuid', 400);
  const view = await deps.getRunView(runId);
  if (!view) throw new ApiError('NOT_FOUND', 'Run not found', 404);
  return ok(view);
}

/** GET /api/cron/opportunities with `Authorization: Bearer <OPPORTUNITY_CRON_SECRET>`. */
export async function handleCron(req: Request, deps: RouteDeps): Promise<Response> {
  const secret = deps.cronSecret();
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    throw new ApiError('UNAUTHENTICATED', 'Invalid cron secret', 401);
  }
  try {
    const summary = await runPipeline(deps.pipeline(), { triggeredBy: 'cron' });
    return ok({ runId: summary.runId, proposalsCreated: summary.proposalsCreated, clustersDetected: summary.clustersDetected });
  } catch (error) {
    if (error instanceof PipelineBusyError) throw busy();
    throw error;
  }
}

/** POST /api/ai/proposals/:id/revise (P1). Business owner only; RLS scopes the proposal read. */
export async function handleRevise(id: string | undefined, req: Request, revise: (id: string, request: ReviseRequest) => Promise<unknown>): Promise<Response> {
  if (!id || !RUN_ID.test(id)) throw new ApiError('VALIDATION', 'id must be a uuid', 400);
  const request = await parseBody(ReviseRequest, req);
  return ok(await revise(id, request));
}

export function defaultRouteDeps(overrides: Partial<RouteDeps> & Pick<RouteDeps, 'pipeline' | 'schedule' | 'getRunView'>): RouteDeps {
  return {
    isDemoMode: () => serverEnv.isDemoMode,
    cronSecret: () => process.env.OPPORTUNITY_CRON_SECRET || undefined,
    ...overrides,
  };
}
