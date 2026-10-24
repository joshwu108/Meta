import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/util/cn';

/**
 * OWNED BY WORKSTREAM 01. Labelled form controls with inline validation messages.
 *
 * The control is wired to its message with `aria-describedby` and marked `aria-invalid`, so
 * a screen reader announces the error with the field rather than leaving it as loose text
 * next to it.
 */

const CONTROL = cn(
  'w-full rounded-sm border border-divider bg-surface px-3 py-2 text-base text-text',
  'placeholder:text-text-3 disabled:opacity-60',
  'aria-[invalid=true]:border-danger',
);

type DescribableProps = { 'aria-describedby'?: string; 'aria-invalid'?: boolean };

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  const messageId = htmlFor ? `${htmlFor}-${error ? 'error' : 'hint'}` : undefined;
  const describedBy = messageId && (error || hint) ? messageId : undefined;

  // Wire the single control this field wraps to its message.
  const control = Children.map(children, (child) =>
    isValidElement(child) && describedBy
      ? cloneElement(child as ReactElement<DescribableProps>, {
          'aria-describedby': describedBy,
          ...(error ? { 'aria-invalid': true } : {}),
        })
      : child,
  );

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text">
        {label}
      </label>
      {control}
      {error ? (
        <p id={messageId} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-sm text-text-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = ({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...rest} className={cn(CONTROL, className)} />
);

export const Textarea = ({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...rest} className={cn(CONTROL, 'min-h-24 resize-y', className)} />
);

export const Select = ({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...rest} className={cn(CONTROL, 'appearance-none pr-8', className)} />
);
