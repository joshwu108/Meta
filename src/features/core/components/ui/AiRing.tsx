import type { ReactNode } from 'react';
import { cn } from './cn';

/** 2px gradient ring around an avatar or card corner, marking the user's agent. */
export function AiRing({ children, className, rounded = 'pill' }: { children: ReactNode; className?: string; rounded?: 'pill' | 'md' }) {
  return (
    <span
      className={cn('inline-flex p-[2px]', rounded === 'pill' ? 'rounded-pill' : 'rounded-[10px]', className)}
      style={{ background: 'var(--gradient-ai)' }}
    >
      <span className={cn('inline-flex bg-surface', rounded === 'pill' ? 'rounded-pill' : 'rounded-md')}>{children}</span>
    </span>
  );
}
