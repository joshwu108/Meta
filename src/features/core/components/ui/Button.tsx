import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leadingIcon?: ReactNode;
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-md px-4 font-semibold whitespace-nowrap select-none ' +
  'transition-[background-color,color,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)] ' +
  'active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-text-on-brand hover:bg-brand-hover active:bg-brand-pressed',
  secondary: 'bg-pressed text-text hover:bg-divider/70 active:bg-divider',
  ghost: 'bg-transparent text-text hover:bg-hover active:bg-pressed',
  danger: 'bg-danger text-text-on-brand hover:brightness-95 active:brightness-90',
};

const sizes: Record<ButtonSize, string> = {
  md: 'h-9 text-[length:var(--text-base)]',
  lg: 'h-10 text-[length:var(--text-base)]',
};

/** Primary action button (design-system §4). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', isLoading = false, leadingIcon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {isLoading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : leadingIcon}
      {children}
    </button>
  );
});
