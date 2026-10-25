import 'server-only';
import type { BusinessEvent, ProposalSummary } from '@/shared/types';
import type { BusinessDeps } from './deps';
import { listBusinessEvents } from './events';
import { listBusinessProposals } from './proposals';

/**
 * `/business` dashboard data (spec section 7, Screen 2): the stat row, the proposals
 * waiting, and the upcoming events with their RSVP progress.
 */

export type DashboardData = {
  stats: { pendingProposals: number; upcomingEvents: number; rsvpsThisMonth: number };
  pending: ProposalSummary[];
  upcoming: BusinessEvent[];
  needsAttention: BusinessEvent[];
};

const LIVE_STATUSES = new Set(['approved_draft', 'published', 'full']);

export async function getDashboard(deps: BusinessDeps, businessId: string): Promise<DashboardData> {
  const [pending, events] = await Promise.all([
    listBusinessProposals(deps, businessId, 'pending'),
    listBusinessEvents(deps, businessId),
  ]);

  const now = deps.now();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const upcoming = events
    .filter((event) => LIVE_STATUSES.has(event.status) && event.startsAt >= now.toISOString())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return {
    stats: {
      pendingProposals: pending.length,
      upcomingEvents: upcoming.length,
      rsvpsThisMonth: events
        .filter((event) => event.startsAt >= monthStart)
        .reduce((total, event) => total + event.confirmedCount, 0),
    },
    pending,
    upcoming,
    // A published event whose start has passed still needs the owner to close it out.
    needsAttention: events.filter(
      (event) => event.status === 'approved_draft' || (event.status === 'published' && event.endsAt < now.toISOString()),
    ),
  };
}
