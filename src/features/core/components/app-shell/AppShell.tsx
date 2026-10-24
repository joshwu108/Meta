import type { ReactNode } from 'react';
import { getCurrentUser } from '@/features/core/server/current-user';
import { countUnreadForCurrentUser } from '@/features/core/server/unread';
import { cn } from '../ui/cn';
import { NavLink } from './NavLink';
import { TopBar } from './TopBar';
import { BUSINESS_NAV, CONSUMER_NAV } from './nav';

export type AppShellProps = {
  mode: 'consumer' | 'business';
  children: ReactNode;
  /** Right rail content (≥1024px, consumer only). */
  aside?: ReactNode;
  /** Pending proposals badge for the business rail (supplied by workstream 05). */
  proposalsBadge?: number;
};

/**
 * App frame (design-system §3). Consumer: 56px top bar, 280px left rail + 320px right rail at
 * ≥1024px with a 680px feed column, bottom tab bar under 768px. Business: left rail ≥768px,
 * 960px center column.
 */
export async function AppShell({ mode, children, aside, proposalsBadge }: AppShellProps) {
  const [user, unread] = await Promise.all([getCurrentUser(), countUnreadForCurrentUser()]);
  const nav = mode === 'consumer' ? CONSUMER_NAV : BUSINESS_NAV;
  const tabItems = nav.filter((item) => item.inTabBar);
  const switchLink =
    mode === 'consumer'
      ? user?.businessId
        ? { href: '/business', label: 'Business' }
        : null
      : user
        ? { href: '/discover', label: 'Consumer app' }
        : null;
  const badgeFor = (href: string) => (mode === 'business' && href === '/business/proposals' ? proposalsBadge : undefined);
  const railBreakpoint = mode === 'consumer' ? 'lg:block' : 'md:block';
  const tabBreakpoint = mode === 'consumer' ? 'md:hidden' : 'md:hidden';

  return (
    <div className="min-h-dvh">
      <TopBar
        homeHref={mode === 'consumer' ? '/discover' : '/business'}
        user={user ? { displayName: user.profile.display_name, avatarUrl: user.profile.avatar_url } : null}
        initialUnread={unread}
        switchLink={switchLink}
      />
      <div className="mx-auto flex max-w-[1400px] gap-4 px-0 lg:px-4">
        <nav aria-label="Main navigation" className={cn('sticky top-[var(--topbar-height)] hidden h-[calc(100dvh-var(--topbar-height))] w-[var(--rail-left)] shrink-0 py-4', railBreakpoint)}>
          <ul className="flex flex-col gap-1 px-2">
            {nav.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href} label={item.label} icon={<item.icon size={20} strokeWidth={1.75} aria-hidden />} layout="rail" badge={badgeFor(item.href)} />
              </li>
            ))}
          </ul>
        </nav>
        <main
          id="main"
          className={cn(
            'w-full min-w-0 flex-1 px-4 pb-[calc(var(--tabbar-height)+24px)] pt-4 md:pb-8',
            mode === 'consumer' ? 'mx-auto max-w-[var(--feed-width)]' : 'mx-auto max-w-[var(--business-width)]',
          )}
        >
          {children}
        </main>
        {mode === 'consumer' && (
          <aside className="sticky top-[var(--topbar-height)] hidden h-[calc(100dvh-var(--topbar-height))] w-[var(--rail-right)] shrink-0 overflow-y-auto py-4 lg:block" aria-label="Contextual">
            {aside}
          </aside>
        )}
      </div>
      <nav aria-label="Primary" className={cn('fixed inset-x-0 bottom-0 z-40 flex h-[var(--tabbar-height)] border-t border-border-subtle bg-surface', tabBreakpoint)}>
        {tabItems.map((item) => (
          <NavLink key={item.href} href={item.href} label={item.label} icon={<item.icon size={22} strokeWidth={1.75} aria-hidden />} layout="tab" />
        ))}
      </nav>
    </div>
  );
}
