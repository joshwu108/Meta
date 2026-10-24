import type { ReactNode } from 'react';
import { cn } from './cn';

export type EmptyStateProps = { icon: ReactNode; title: string; action?: ReactNode; className?: string };

/** Icon + one line + one action. */
export function EmptyState({ icon, title, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-pill bg-surface-2 text-text-2">{icon}</span>
      <p className="text-text-2">{title}</p>
      {action}
    </div>
  );
}
