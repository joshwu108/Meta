import type { CSSProperties } from 'react';
import { cn } from './cn';

export type CapacityMeterProps = { confirmed: number; capacity: number; className?: string; showLabel?: boolean };

export function capacityRatio(confirmed: number, capacity: number): number {
  if (capacity <= 0) return 1;
  return Math.min(1, Math.max(0, confirmed / capacity));
}

/** Thin bar, blue fill; amber at ≥80%, red when full. Width animates once on mount. */
export function CapacityMeter({ confirmed, capacity, className, showLabel = true }: CapacityMeterProps) {
  const ratio = capacityRatio(confirmed, capacity);
  const isFull = ratio >= 1;
  const isTight = ratio >= 0.8;
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={confirmed}
        aria-label="Spots filled"
        className="h-1.5 flex-1 overflow-hidden rounded-pill bg-pressed"
      >
        <div
          className={cn('meter-fill h-full origin-left rounded-pill', isFull ? 'bg-danger' : isTight ? 'bg-warning' : 'bg-brand')}
          style={{ '--meter-ratio': ratio } as CSSProperties}
        />
      </div>
      {showLabel && (
        <span className="shrink-0 text-[length:var(--text-xs)] text-text-2">
          {isFull ? 'Full' : `${Math.max(0, capacity - confirmed)} left`}
        </span>
      )}
    </div>
  );
}
