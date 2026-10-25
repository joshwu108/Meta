'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../ui/cn';
import type { ReactNode } from 'react';
import { isNavActive } from './nav';

type Props = { href: string; label: string; icon: ReactNode; layout: 'rail' | 'tab'; badge?: number };

/** Nav item for the left rail (icon + label) or bottom tab bar (icon over label). */
export function NavLink({ href, label, icon, layout, badge }: Props) {
  const pathname = usePathname();
  const isActive = isNavActive(pathname, href);
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-3 rounded-md font-medium no-underline transition-colors duration-[var(--duration-fast)] hover:no-underline',
        layout === 'rail' ? 'h-11 px-3' : 'h-full flex-1 flex-col justify-center gap-0.5 text-[length:var(--text-xs)]',
        isActive ? 'bg-brand-soft text-brand-ink' : 'text-text hover:bg-hover active:bg-pressed',
        layout === 'tab' && isActive && 'bg-transparent',
      )}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-danger px-1.5 text-[length:var(--text-xs)] font-bold text-text-on-brand">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}
