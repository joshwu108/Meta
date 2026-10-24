'use client';
import { cn } from './cn';

export type SwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
};

/** iOS-style switch; on = brand. Used for every consent toggle. */
export function Switch({ checked, onChange, label, description, disabled }: SwitchProps) {
  return (
    <label className={cn('flex items-center justify-between gap-4 py-2', disabled && 'opacity-50')}>
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-[length:var(--text-sm)] text-text-2">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-[var(--duration-normal)] ease-[var(--ease-standard)]',
          checked ? 'bg-brand' : 'bg-divider',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-6 w-6 rounded-pill bg-white shadow-[var(--shadow-1)] transition-transform duration-[var(--duration-normal)] ease-[var(--ease-standard)]',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </label>
  );
}
