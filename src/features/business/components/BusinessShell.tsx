import Link from 'next/link';
import { CalendarDays, LayoutDashboard, Lightbulb, Sparkles } from 'lucide-react';
import { cn } from '@/lib/util/cn';

/**
 * The business app frame (design-system.md section 3): 56px top bar, left rail from 768px,
 * 960px centre column for tables. The Proposals item carries a blue badge with the pending
 * count (spec section 7).
 */

export type BusinessNavKey = 'dashboard' | 'proposals' | 'events' | 'insights';

const ITEMS = [
  { key: 'dashboard', href: '/business', label: 'Dashboard', Icon: LayoutDashboard },
  { key: 'proposals', href: '/business/proposals', label: 'Proposals', Icon: Sparkles },
  { key: 'events', href: '/business/events', label: 'Events', Icon: CalendarDays },
  { key: 'insights', href: '/business/insights', label: 'Insights', Icon: Lightbulb },
] as const satisfies readonly { key: BusinessNavKey; href: string; label: string; Icon: typeof LayoutDashboard }[];

export function BusinessShell({
  active,
  businessName,
  pendingCount,
  children,
}: {
  active: BusinessNavKey;
  businessName: string;
  pendingCount: number;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border-subtle bg-surface px-4">
        <Link href="/business" className="text-md font-bold tracking-tight">
          CommonGround
        </Link>
        <span className="hidden text-sm text-text-2 sm:inline">for business</span>
        <span className="ml-auto truncate text-sm font-medium text-text-2">{businessName}</span>
      </header>

      <div className="mx-auto flex w-full max-w-[1280px] gap-6 px-4 py-6">
        <nav aria-label="Business sections" className="hidden w-60 shrink-0 md:block">
          <ul className="flex flex-col gap-1">
            {ITEMS.map(({ key, href, label, Icon }) => (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={key === active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2.5 text-base font-medium',
                    'transition-colors duration-[120ms]',
                    key === active ? 'bg-brand-soft text-brand' : 'text-text hover:bg-hover',
                  )}
                >
                  <Icon aria-hidden size={20} strokeWidth={1.75} />
                  {label}
                  {key === 'proposals' && pendingCount > 0 ? (
                    <span className="ml-auto inline-flex min-w-5 justify-center rounded-pill bg-brand px-1.5 text-xs font-bold text-text-on-brand">
                      {pendingCount}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 md:max-w-[960px]">{children}</main>
      </div>

      {/* Below 768px the rail becomes a bottom bar so nothing scrolls sideways at 320px. */}
      <nav
        aria-label="Business sections"
        className="sticky bottom-0 flex border-t border-border-subtle bg-surface md:hidden"
      >
        {ITEMS.map(({ key, href, label, Icon }) => (
          <Link
            key={key}
            href={href}
            aria-current={key === active ? 'page' : undefined}
            className={cn(
              'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium',
              key === active ? 'text-brand' : 'text-text-2',
            )}
          >
            <Icon aria-hidden size={20} strokeWidth={1.75} />
            {label}
            {key === 'proposals' && pendingCount > 0 ? (
              <span className="absolute right-[18%] top-1 inline-flex min-w-4 justify-center rounded-pill bg-brand px-1 text-[10px] font-bold text-text-on-brand">
                {pendingCount}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}
