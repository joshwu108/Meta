import { cn } from '@/lib/util/cn';

/**
 * OWNED BY WORKSTREAM 01. Status -> colour: published/confirmed green, pending/awaiting
 * amber, cancelled red, draft gray, full blue-soft (design-system.md section 4).
 */

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<StatusTone, string> = {
  neutral: 'bg-surface-2 text-text-2',
  info: 'bg-brand-soft text-brand',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-text',
  danger: 'bg-danger-soft text-danger',
};

export function StatusPill({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-semibold',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
