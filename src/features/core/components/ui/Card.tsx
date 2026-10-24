import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type CardProps = HTMLAttributes<HTMLDivElement> & { isClickable?: boolean; as?: 'div' | 'article' | 'section' };

/** Surface card: radius-md, shadow-1, 16px padding. Hover shadow only when the whole card is clickable. */
export function Card({ isClickable = false, className, as = 'div', ...rest }: CardProps) {
  const Tag = as;
  return (
    <Tag
      className={cn(
        'surface-card p-4',
        isClickable && 'cursor-pointer transition-shadow duration-[var(--duration-fast)] hover:shadow-[var(--shadow-2)]',
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <header className={cn('mb-3 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 className="truncate">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[length:var(--text-sm)] text-text-2">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <footer className={cn('mt-4 flex items-center justify-between gap-3 border-t border-border-subtle pt-3', className)}>{children}</footer>;
}
