import Link from 'next/link';
import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar } from '../ui/Avatar';
import { ThemeToggle } from '../theme/ThemeToggle';
import { NotificationBell } from '../notifications/NotificationBell';
import { SignOutButton } from './SignOutButton';

export type TopBarProps = {
  homeHref: string;
  user: { displayName: string; avatarUrl: string | null } | null;
  initialUnread: number;
  switchLink?: { href: string; label: string } | null;
  trailing?: ReactNode;
};

/** 56px top bar: wordmark (text only, no logo), search, bell, theme, avatar. */
export function TopBar({ homeHref, user, initialUnread, switchLink, trailing }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 h-[var(--topbar-height)] bg-surface shadow-[var(--shadow-1)]">
      <div className="mx-auto flex h-full max-w-[1400px] items-center gap-3 px-4">
        <Link href={homeHref} className="text-[length:var(--text-lg)] font-bold text-text no-underline hover:no-underline">
          CommonGround
        </Link>
        <label className="relative ml-2 hidden h-10 flex-1 max-w-xs items-center md:flex">
          <Search size={18} className="pointer-events-none absolute left-3 text-text-3" aria-hidden />
          <input
            type="search"
            placeholder="Search CommonGround"
            aria-label="Search"
            className="h-10 w-full rounded-pill bg-surface-2 pl-10 pr-4 text-text placeholder:text-text-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-brand"
          />
        </label>
        <div className="ml-auto flex items-center gap-2">
          {switchLink && (
            <Link href={switchLink.href} className="hidden rounded-pill bg-surface-2 px-3 py-2 text-[length:var(--text-sm)] font-semibold text-text no-underline hover:bg-hover hover:no-underline sm:inline-flex">
              {switchLink.label}
            </Link>
          )}
          {trailing}
          <ThemeToggle />
          {user && <NotificationBell initialUnread={initialUnread} />}
          {user ? (
            <div className="flex items-center gap-2">
              <Avatar name={user.displayName} src={user.avatarUrl} size={32} />
              <SignOutButton />
            </div>
          ) : (
            <Link href="/login" className="font-semibold">
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
