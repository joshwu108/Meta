import type { CSSProperties } from 'react';
import type { CompatibilityResult } from '@/shared/types';
import { BREAKDOWN_LABELS } from '../labels';

const ORDER = ['interests', 'availability', 'social', 'location', 'budget'] as const;

/** "Why this match?" bars: each component's similarity, blue fill on the pressed track. */
export function BreakdownBars({ breakdown }: { breakdown: CompatibilityResult['breakdown'] }) {
  return (
    <dl className="flex flex-col gap-2" aria-label="Score breakdown">
      {ORDER.map((key) => {
        const value = Math.max(0, Math.min(1, breakdown[key]));
        return (
          <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(64px,120px)_40px] items-center gap-3">
            <dt className="truncate text-[length:var(--text-sm)] text-text-2">{BREAKDOWN_LABELS[key]}</dt>
            <dd className="h-1.5 overflow-hidden rounded-pill bg-pressed">
              <div className="meter-fill h-full origin-left rounded-pill bg-brand" style={{ '--meter-ratio': value } as CSSProperties} />
            </dd>
            <dd className="text-right text-[length:var(--text-xs)] tabular-nums text-text-2">{Math.round(value * 100)}%</dd>
          </div>
        );
      })}
    </dl>
  );
}
