import type {
  ComponentProps,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/features/core/components/ui';
import type { ButtonVariant } from '@/features/core/components/ui';

type ButtonSize = 'md' | 'lg';

/**
 * Form controls the shared set does not provide.
 *
 * Workstream 01 ships `Input` with its own label, hint and error, and 05 uses that
 * directly. It has no textarea, select or link-styled button, so those live here, with the
 * same props shape as 01's `Input` so a field reads the same whichever control it uses.
 */

const CONTROL = cn(
  'w-full rounded-sm border bg-surface px-3 py-2 text-[length:var(--text-base)] text-text',
  'placeholder:text-text-3 disabled:opacity-60',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
);

type FieldShell = { label: string; hint?: string; error?: string; id?: string };

function useFieldIds(id: string | undefined, label: string, error?: string, hint?: string) {
  const fieldId = id ?? label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    fieldId,
    describedBy: error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined,
  };
}

function Shell({
  fieldId,
  label,
  hint,
  error,
  children,
}: FieldShell & { fieldId: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-[length:var(--text-sm)] font-medium text-text-2">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${fieldId}-error`} className="text-[length:var(--text-sm)] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-[length:var(--text-sm)] text-text-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldShell;

export function Textarea({ label, hint, error, id, className, ...rest }: TextareaProps) {
  const { fieldId, describedBy } = useFieldIds(id, label, error, hint);
  return (
    <Shell fieldId={fieldId} label={label} hint={hint} error={error}>
      <textarea
        {...rest}
        id={fieldId}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, 'min-h-24 resize-y', error ? 'border-danger' : 'border-divider', className)}
      />
    </Shell>
  );
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & FieldShell;

export function Select({ label, hint, error, id, className, children, ...rest }: SelectProps) {
  const { fieldId, describedBy } = useFieldIds(id, label, error, hint);
  return (
    <Shell fieldId={fieldId} label={label} hint={hint} error={error}>
      <select
        {...rest}
        id={fieldId}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, 'appearance-none pr-8', error ? 'border-danger' : 'border-divider', className)}
      >
        {children}
      </select>
    </Shell>
  );
}

/** A plain labelled control group, for anything that is not a single input. */
export function Field({ label, hint, error, id, children }: FieldShell & { children: ReactNode }) {
  const { fieldId } = useFieldIds(id, label, error, hint);
  return (
    <Shell fieldId={fieldId} label={label} hint={hint} error={error}>
      {children}
    </Shell>
  );
}

export type CheckboxProps = InputHTMLAttributes<HTMLInputElement> & { label: ReactNode };

export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  return (
    <label className="flex items-center gap-2 text-[length:var(--text-sm)] font-medium">
      <input type="checkbox" {...rest} className={cn('size-4 accent-[var(--color-brand)]', className)} />
      {label}
    </label>
  );
}

const LINK_BASE =
  'inline-flex items-center justify-center gap-2 rounded-md px-4 font-semibold whitespace-nowrap select-none ' +
  'transition-[background-color,color,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)] ' +
  'active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

const LINK_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-text-on-brand hover:bg-brand-hover active:bg-brand-pressed',
  secondary: 'bg-pressed text-text hover:bg-divider/70 active:bg-divider',
  ghost: 'bg-transparent text-text hover:bg-hover active:bg-pressed',
  danger: 'bg-danger text-text-on-brand hover:brightness-95 active:brightness-90',
};

const LINK_SIZES: Record<ButtonSize, string> = { md: 'h-9', lg: 'h-10' };

export type ButtonLinkProps = ComponentProps<'a'> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/**
 * A link that looks like a Button, for navigation actions (Review, Edit, New event).
 *
 * A plain anchor, not next/link: in a production build the App Router intermittently fetched
 * the target's RSC payload and then discarded it, so Review left the owner on the dashboard
 * (see `navigate` in use-submit.ts). Every business page is force-dynamic, so a real load
 * costs one round trip and always shows fresh data.
 */
export function ButtonLink({ variant = 'primary', size = 'md', className, ...rest }: ButtonLinkProps) {
  return (
    <a
      {...rest}
      className={cn(LINK_BASE, LINK_VARIANTS[variant], LINK_SIZES[size], 'text-[length:var(--text-base)]', className)}
    />
  );
}
