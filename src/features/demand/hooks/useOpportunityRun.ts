'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api/client';
import type { RunView } from '../server/store-supabase';

type State = { runId: string | null; view: RunView | null; error: string | null; isStarting: boolean };

const POLL_MS = 800;

/** Starts a run and polls its status until it completes or fails. */
export function useOpportunityRun() {
  const [state, setState] = useState<State>({ runId: null, view: null, error: null, isStarting: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async (runId: string) => {
    try {
      const view = await apiGet<RunView>(`/api/ai/opportunities/${runId}`, { cache: 'no-store' });
      setState((s) => ({ ...s, view }));
      if (view.status === 'running') timer.current = setTimeout(() => void poll(runId), POLL_MS);
    } catch (error) {
      setState((s) => ({ ...s, error: error instanceof Error ? error.message : 'Could not load the run' }));
    }
  }, []);

  const start = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    setState({ runId: null, view: null, error: null, isStarting: true });
    try {
      const { runId } = await apiPost<{ runId: string }>('/api/ai/generate-opportunities', {});
      setState((s) => ({ ...s, runId, isStarting: false }));
      void poll(runId);
    } catch (error) {
      setState((s) => ({ ...s, isStarting: false, error: error instanceof Error ? error.message : 'Could not start the run' }));
    }
  }, [poll]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const isRunning = state.isStarting || state.view?.status === 'running' || (state.runId !== null && state.view === null && !state.error);
  return { ...state, isRunning, start };
}
