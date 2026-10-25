import { Check } from 'lucide-react';
import { cn } from '@/features/core/components/ui';
import type { RunStage } from '../schemas';
import { STAGE_STEPS, stepStates } from './labels';

export function StageTracker({ stage, status }: { stage: RunStage | null; status: 'running' | 'completed' | 'failed' | null }) {
  const states = stepStates(stage, status);
  return (
    <ol aria-label="Run progress" className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-3">
      {STAGE_STEPS.map((step, i) => {
        const state = states[i];
        return (
          <li key={step.stage} className="flex items-center gap-2" aria-current={state === 'current' ? 'step' : undefined} data-state={state}>
            <span
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-pill text-[length:var(--text-xs)] font-semibold',
                state === 'done' && 'bg-brand text-text-on-brand',
                state === 'current' && 'bg-brand-soft text-brand ring-2 ring-brand',
                state === 'upcoming' && 'bg-surface-2 text-text-3',
              )}
            >
              {state === 'done' ? <Check size={14} strokeWidth={2.5} aria-hidden /> : i + 1}
            </span>
            <span className={cn('text-[length:var(--text-sm)]', state === 'upcoming' ? 'text-text-3' : 'text-text')}>{step.label}</span>
            {i < STAGE_STEPS.length - 1 && <span aria-hidden className="mx-1 hidden h-px w-6 bg-divider sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}
