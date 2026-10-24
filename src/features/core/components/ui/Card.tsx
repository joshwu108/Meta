import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/util/cn';

/** OWNED BY WORKSTREAM 01. Surface, radius-md, shadow-1, 16px padding. */

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  interactive?: boolean;
};

export function Card({ className, children, interactive = false, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        'rounded-md bg-surface p-4 shadow-1',
        interactive && 'transition-shadow duration-[120ms] hover:shadow-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-md font-semibold leading-tight">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-text-2">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
      {children}
    </div>
  );
}
