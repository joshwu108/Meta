'use client';

import { cn } from '@/lib/util/cn';

/** OWNED BY WORKSTREAM 01. iOS-style; on = brand. Used by every consent toggle. */
export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-base font-medium">{label}</span>
        {description ? <span className="mt-0.5 block text-sm text-text-2">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-pill transition-colors duration-[120ms]',
          checked ? 'bg-brand' : 'bg-pressed',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-pill bg-surface shadow-1',
            'transition-[left] duration-[120ms] ease-[var(--ease-standard)]',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  );
}
