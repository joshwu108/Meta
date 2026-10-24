'use client';
import { Info, Sparkles } from 'lucide-react';
import { AiTag, Button, Card, EmptyState, StatusPill } from '@/features/core/components/ui';
import { useOpportunityRun } from '../hooks/useOpportunityRun';
import type { RunView } from '../server/store-supabase';
import { bandLabel, categoryLabel, slotLabel } from './labels';
import { StageTracker } from './StageTracker';

function ResultsTable({ view }: { view: RunView }) {
  if (view.proposals.length === 0) {
    return <EmptyState icon={<Sparkles size={20} aria-hidden />} title={view.status === 'running' ? 'Drafting proposals…' : 'No new proposals this run'} />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[length:var(--text-sm)]">
        <thead className="text-text-2">
          <tr className="border-b border-border-subtle">
            <th className="py-2 pr-3 font-medium">Cluster</th>
            <th className="py-2 pr-3 font-medium">Venue</th>
            <th className="py-2 pr-3 font-medium">Proposal</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {view.proposals.map((p) => (
            <tr key={p.id} className="border-b border-border-subtle last:border-0">
              <td className="py-3 pr-3">
                {categoryLabel(p.category)} · {slotLabel(p.slot)} · {p.neighborhood}
                <span className="block text-text-2">{bandLabel(p.demandBand)}</span>
              </td>
              <td className="py-3 pr-3">{p.businessName}</td>
              <td className="py-3 pr-3">
                <a className="font-semibold text-brand hover:underline" href={`/business/proposals/${p.id}`}>{p.title}</a>
                <AiTag className="ml-2 align-middle" />
              </td>
              <td className="py-3"><StatusPill status={p.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Suppressed({ count, minCohortSize }: { count: number; minCohortSize: number }) {
  const why = `Below the minimum cohort size of ${minCohortSize}, not shown to businesses`;
  return (
    <p className="mt-3 flex items-center gap-1.5 text-[length:var(--text-sm)] text-text-2" title={why}>
      <Info size={14} aria-hidden />
      <span>{count} small {count === 1 ? 'cohort' : 'cohorts'} suppressed</span>
      <span className="sr-only">{why}</span>
    </p>
  );
}

/** Scene 3 presenter control panel: one lead card with Generate and the tracker, then results. */
export function OpportunitiesConsole({ minCohortSize }: { minCohortSize: number }) {
  const run = useOpportunityRun();
  const view = run.view;
  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-3 px-4 py-6">
      <Card as="section" aria-labelledby="gen-title">
        <h1 id="gen-title" className="text-[length:var(--text-2xl)] font-bold">Community opportunities</h1>
        <p className="mt-1 max-w-prose text-text-2">
          Find groups of nearby people who want the same kind of experience at the same time, and draft an event proposal for the best local venue. Businesses only ever see banded, anonymous demand.
        </p>
        <Button size="lg" className="mt-5" onClick={() => void run.start()} isLoading={run.isRunning} disabled={run.isRunning}>
          Generate Opportunities
        </Button>
        {(run.runId || run.isStarting) && <StageTracker stage={view?.stage ?? 'collecting'} status={view?.status ?? 'running'} />}
        {view && view.stats.clustersSuppressed !== undefined && <Suppressed count={view.stats.clustersSuppressed} minCohortSize={minCohortSize} />}
        {run.error && <p role="alert" className="mt-3 text-[length:var(--text-sm)] text-danger">{run.error}</p>}
        {view?.status === 'failed' && <p role="alert" className="mt-3 text-[length:var(--text-sm)] text-danger">The run failed. Try again.</p>}
      </Card>
      {view && (
        <Card as="section" aria-label="Results" aria-live="polite">
          <ResultsTable view={view} />
        </Card>
      )}
    </div>
  );
}
