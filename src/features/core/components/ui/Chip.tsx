'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/util/cn';

/**
 * OWNED BY WORKSTREAM 01. Pill, surface-2 by default, selected = brand-soft with blue text,
 * removable with a ✕ (Backspace from the keyboard).
 */
export function Chip({
  children,
  selected = false,
  onToggle,
  onRemove,
  className,
}: {
  children: React.ReactNode;
  selected?: boolean;
  onToggle?: () => void;
  onRemove?: () => void;
  className?: string;
}) {
  const interactive = onToggle !== undefined || onRemove !== undefined;

  return (
    <button
      type="button"
      aria-pressed={onToggle ? selected : undefined}
      onClick={onToggle ?? onRemove}
      onKeyDown={(event) => {
        if (onRemove && (event.key === 'Backspace' || event.key === 'Delete')) {
          event.preventDefault();
          onRemove();
        }
      }}
      disabled={!interactive}
      className={cn(
        'inline-flex items-center gap-1 rounded-pill px-3 py-1 text-sm font-medium',
        'transition-colors duration-[120ms] disabled:cursor-default',
        selected ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-text-2',
        interactive && !selected && 'hover:bg-pressed',
        className,
      )}
    >
      {children}
      {onRemove ? <X aria-hidden size={14} strokeWidth={1.75} /> : null}
    </button>
  );
}
