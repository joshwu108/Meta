import type { LucideIcon } from 'lucide-react';
import { Activity, BarChart3, Bot, CalendarDays, Compass, Inbox, LayoutDashboard, Share2, Users, UsersRound } from 'lucide-react';

export type NavItem = { href: string; label: string; icon: LucideIcon; /** Show in the mobile bottom tab bar. */ inTabBar?: boolean };

export const CONSUMER_NAV: ReadonlyArray<NavItem> = [
  { href: '/discover', label: 'Discover', icon: Compass, inTabBar: true },
  { href: '/match', label: 'Match', icon: Users, inTabBar: true },
  { href: '/groups', label: 'Groups', icon: UsersRound, inTabBar: true },
  { href: '/events', label: 'Events', icon: CalendarDays, inTabBar: true },
  { href: '/graph', label: 'Graph', icon: Share2, inTabBar: true },
  { href: '/agent', label: 'Agent', icon: Bot, inTabBar: true },
  { href: '/activity', label: 'Activity', icon: Activity },
];

export const BUSINESS_NAV: ReadonlyArray<NavItem> = [
  { href: '/business', label: 'Dashboard', icon: LayoutDashboard, inTabBar: true },
  { href: '/business/proposals', label: 'Proposals', icon: Inbox, inTabBar: true },
  { href: '/business/events', label: 'Events', icon: CalendarDays, inTabBar: true },
  { href: '/business/insights', label: 'Insights', icon: BarChart3, inTabBar: true },
];

/** Active when the path equals the item or is nested under it (but `/business` only matches exactly). */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/business') return pathname === '/business';
  return pathname === href || pathname.startsWith(`${href}/`);
}
