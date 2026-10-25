import { cn } from '@/features/core/components/ui';

/** Compatibility score as a blue ring (spec §7). Decorative ring, the number carries the meaning. */
export function ScoreRing({ score, size = 56, className }: { score: number; size?: 40 | 56; className?: string }) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const stroke = size === 56 ? 4 : 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <span
      role="img"
      aria-label={`Compatibility ${value} out of 100`}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-pressed)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
        />
      </svg>
      <span className={cn('absolute font-bold tabular-nums text-text', size === 56 ? 'text-[length:var(--text-md)]' : 'text-[length:var(--text-sm)]')}>
        {value}
      </span>
    </span>
  );
}
