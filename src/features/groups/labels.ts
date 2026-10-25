import type { MemberRole, Visibility } from '@/shared/enums';

/** Display copy and formatting for group screens. Safe to import from client components. */

export const VISIBILITY_COPY: Readonly<Record<Visibility, { label: string; description: string }>> = {
  private: { label: 'Private', description: 'Only people you invite can see the group, its members and its plans.' },
  public: { label: 'Public', description: 'Anyone on Weave can find the group and see who is in it. Members can invite others.' },
};

export const ROLE_LABELS: Readonly<Record<MemberRole, string>> = { owner: 'Owner', admin: 'Admin', member: 'Member' };

const EVENT_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "Thu, Oct 29, 7:00 PM" in the venue's time zone. */
export function formatEventTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : EVENT_TIME.format(date);
}

/** "$20", "Free", or null when unknown. */
export function formatCost(cents: number | null): string | null {
  if (cents === null) return null;
  if (cents === 0) return 'Free';
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
