'use client';
import { X } from 'lucide-react';
import { useEffect, useId, type ReactNode } from 'react';
import { cn } from './cn';

export type SheetProps = {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** `sheet` slides from the bottom on mobile; `modal` is centered. */
  variant?: 'sheet' | 'modal';
};

/** Sheet / Modal: radius-lg, shadow-3, token backdrop. Escape closes; focus returns to the trigger. */
export function Sheet({ isOpen, onClose, title, children, footer, variant = 'sheet' }: SheetProps) {
  const titleId = useId();
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return (
    <div
      className={cn('fixed inset-0 z-50 flex', variant === 'sheet' ? 'items-end sm:items-center' : 'items-center', 'justify-center p-0 sm:p-4')}
      style={{ background: 'var(--backdrop)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          'rise-in w-full bg-surface shadow-[var(--shadow-3)] sm:max-w-lg',
          variant === 'sheet' ? 'rounded-t-lg sm:rounded-lg' : 'rounded-lg',
        )}
      >
        <header className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <h2 id={titleId}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-pill hover:bg-hover active:bg-pressed">
            <X size={20} aria-hidden />
          </button>
        </header>
        <div className="max-h-[70dvh] overflow-y-auto p-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-border-subtle px-4 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
