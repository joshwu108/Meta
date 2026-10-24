import { cn } from '@/lib/util/cn';

/**
 * OWNED BY WORKSTREAM 01. Thin bar, blue fill, amber at 80%, red when full
 * (design-system.md section 4).
 */
export function CapacityMeter({
  confirmed,
  capacity,
  className,
}: {
  confirmed: number;
  capacity: number;
  className?: string;
}) {
  const ratio = capacity > 0 ? Math.min(1, confirmed / capacity) : 0;
  const fill = ratio >= 1 ? 'bg-danger' : ratio >= 0.8 ? 'bg-warning' : 'bg-brand';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="h-1.5 w-full overflow-hidden rounded-pill bg-pressed"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={confirmed}
        aria-label={`${confirmed} of ${capacity} places taken`}
      >
        <div
          className={cn('h-full rounded-pill transition-[width] duration-[200ms]', fill)}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-text-2">
        {confirmed}/{capacity}
      </span>
    </div>
  );
}
