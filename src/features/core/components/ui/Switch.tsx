'use client';
import { cn } from './cn';

export type SwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Visible label. Omit it (and pass `labelledBy`) when the row renders its own text. */
  label?: string;
  description?: string;
  disabled?: boolean;
  /** id of an external element that labels the control. */
  labelledBy?: string;
  /** id of an external element that describes the control. */
  describedBy?: string;
  className?: string;
};

/**
 * iOS-style switch; on = brand. Used for every consent toggle. With `label` it renders a full
 * row (label + optional description); without it, only the control, labelled via `labelledBy`.
 */
export function Switch({ checked, onChange, label, description, disabled, labelledBy, describedBy, className }: SwitchProps) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-[var(--duration-normal)] ease-[var(--ease-standard)]',
        checked ? 'bg-brand' : 'bg-divider',
        !label && className,
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 h-6 w-6 rounded-pill bg-white shadow-[var(--shadow-1)] transition-transform duration-[var(--duration-normal)] ease-[var(--ease-standard)]',
          checked && 'translate-x-5',
        )}
      />
    </button>
  );
  if (!label) return control;
  return (
    <label className={cn('flex items-center justify-between gap-4 py-2', disabled && 'opacity-50', className)}>
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-[length:var(--text-sm)] text-text-2">{description}</span>}
      </span>
      {control}
    </label>
  );
}
