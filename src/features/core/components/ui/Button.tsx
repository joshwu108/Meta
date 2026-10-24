import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/util/cn';

/**
 * OWNED BY WORKSTREAM 01 (design-system.md section 4). Variants primary, secondary, ghost,
 * danger; 36px and 40px heights; hover darkens, active scales to .98.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-text-on-brand hover:bg-brand-hover active:bg-brand-pressed',
  secondary: 'bg-pressed text-text hover:bg-hover',
  ghost: 'bg-transparent text-text hover:bg-hover',
  danger: 'bg-danger text-text-on-brand hover:brightness-95',
};

const SIZES: Record<ButtonSize, string> = {
  md: 'h-9 px-4 text-base',
  lg: 'h-10 px-5 text-base',
};

export const buttonClass = (
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string =>
  cn(
    'inline-flex items-center justify-center gap-2 rounded-md font-semibold',
    'transition-[background-color,transform] duration-[120ms] ease-[var(--ease-standard)]',
    'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
    VARIANTS[variant],
    SIZES[size],
    className,
  );

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

export function Button({ variant, size, className, children, ...rest }: ButtonProps) {
  return (
    <button {...rest} className={buttonClass(variant, size, className)}>
      {children}
    </button>
  );
}

export type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/** A link that looks like a button, for navigation actions (Review, Edit, New event). */
export function ButtonLink({ variant, size, className, ...rest }: ButtonLinkProps) {
  return <Link {...rest} className={buttonClass(variant, size, className)} />;
}
