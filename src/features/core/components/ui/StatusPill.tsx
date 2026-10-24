import { cn } from './cn';

/** Statuses the pill knows how to color. Unknown values fall back to gray. */
export type PillStatus =
  | 'published'
  | 'confirmed'
  | 'approved'
  | 'accepted'
  | 'active'
  | 'pending'
  | 'awaiting_approval'
  | 'proposed'
  | 'waitlisted'
  | 'invited'
  | 'modified'
  | 'cancelled'
  | 'rejected'
  | 'declined'
  | 'expired'
  | 'approved_draft'
  | 'completed'
  | 'full'
  | (string & {});

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'brand';

const TONES: Record<string, Tone> = {
  published: 'success',
  confirmed: 'success',
  approved: 'success',
  accepted: 'success',
  active: 'success',
  pending: 'warning',
  awaiting_approval: 'warning',
  proposed: 'warning',
  waitlisted: 'warning',
  invited: 'warning',
  modified: 'warning',
  cancelled: 'danger',
  rejected: 'danger',
  declined: 'danger',
  expired: 'danger',
  approved_draft: 'neutral',
  completed: 'neutral',
  full: 'brand',
};

const toneClass: Record<Tone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-surface-2 text-text-2',
  brand: 'bg-brand-soft text-brand',
};

export function statusTone(status: string): Tone {
  return TONES[status] ?? 'neutral';
}

export function statusLabel(status: string): string {
  if (status === 'approved_draft') return 'Draft';
  return status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Semantic status pill: green confirmed, amber pending, red cancelled, gray draft, blue-soft full. */
export function StatusPill({ status, className }: { status: PillStatus; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center rounded-pill px-2 text-[length:var(--text-xs)] font-semibold', toneClass[statusTone(status)], className)}>
      {statusLabel(status)}
    </span>
  );
}
