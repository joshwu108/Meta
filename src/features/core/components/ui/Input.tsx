import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string };

/** Labeled text input, radius-sm, brand focus ring. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, className, id, ...rest }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={inputId} className="text-[length:var(--text-sm)] font-medium text-text-2">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-10 rounded-sm border bg-surface px-3 text-text placeholder:text-text-3 transition-colors duration-[var(--duration-fast)]',
          'focus:border-brand focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand',
          error ? 'border-danger' : 'border-divider',
        )}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-[length:var(--text-sm)] text-danger-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-[length:var(--text-sm)] text-text-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
