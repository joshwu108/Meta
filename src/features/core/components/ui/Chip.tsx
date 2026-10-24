'use client';
import { X } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from './cn';

export type ChipProps = {
  children: ReactNode;
  /** Plain-text label used for the remove button's accessible name ("Remove Pottery"). */
  label?: string;
  selected?: boolean;
  onSelect?: () => void;
  onRemove?: () => void;
  className?: string;
};

/** Accessible name for a chip's remove button. */
export function removeLabel(label: string | undefined, children: ReactNode): string {
  const text = label ?? (typeof children === 'string' || typeof children === 'number' ? String(children) : '');
  return text ? `Remove ${text}` : 'Remove';
}

/** Pill chip. Selected = brand-soft fill with blue text. Backspace or ✕ removes when `onRemove` is set. */
export function Chip({ children, label, selected = false, onSelect, onRemove, className }: ChipProps) {
  const interactive = Boolean(onSelect || onRemove);
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (onRemove && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault();
      onRemove();
    }
    if (onSelect && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onSelect();
    }
  };
  return (
    <span
      role={onSelect ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={onSelect ? selected : undefined}
      onClick={onSelect}
      onKeyDown={interactive ? onKeyDown : undefined}
      className={cn(
        'inline-flex h-8 items-center gap-1 rounded-pill px-3 text-[length:var(--text-sm)] font-medium',
        'transition-colors duration-[var(--duration-fast)]',
        selected ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-text',
        interactive && 'cursor-pointer hover:bg-hover',
        selected && interactive && 'hover:bg-brand-soft-2',
        className,
      )}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel(label, children)}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-pill hover:bg-pressed"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </span>
  );
}
