import { CalendarPlus, Sparkles } from 'lucide-react';
import { Card, CardHeader, EmptyState } from '@/features/core/components/ui';
import { ButtonLink } from '@/features/business/components/form';
import { EventListRow } from '@/features/business/components/EventListRow';
import { ProposalCard } from '@/features/business/components/ProposalCard';
import { StatRow } from '@/features/business/components/StatRow';
import { getDashboard } from '@/features/business/server/dashboard';
import { requireBusinessPage } from '@/features/business/server/page-data';

export const dynamic = 'force-dynamic';

/** Business Screen 2 — the dashboard (spec section 7). */
export default async function BusinessDashboardPage() {
  const { deps, business } = await requireBusinessPage();
  const data = await getDashboard(deps, business.id);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold leading-tight">{business.name}</h1>
          <p className="mt-1 text-sm text-text-2">
            {business.neighborhood ? `${business.neighborhood} · ` : ''}
            Hosts up to {business.capabilities.capacity} people
          </p>
        </div>
        <ButtonLink href="/business/events/new">
          <CalendarPlus aria-hidden size={20} strokeWidth={1.75} />
          New event
        </ButtonLink>
      </header>

      <StatRow
        items={[
          { label: 'Proposals waiting', value: data.stats.pendingProposals, hint: 'AI suggestions to review' },
          { label: 'Upcoming events', value: data.stats.upcomingEvents },
          { label: 'RSVPs this month', value: data.stats.rsvpsThisMonth },
        ]}
      />

      {/* The lead element of the page: what the owner has to decide on. */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles aria-hidden size={20} strokeWidth={1.75} />
          AI proposals waiting
        </h2>
        {data.pending.length === 0 ? (
          <EmptyState icon={<Sparkles aria-hidden size={24} strokeWidth={1.75} />} title="No proposals right now. When people nearby show interest in something you could host, it will appear here for you to approve, edit or reject." />
        ) : (
          data.pending.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} />)
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Upcoming events</h2>
        {data.upcoming.length === 0 ? (
          <EmptyState
            icon={<CalendarPlus aria-hidden size={24} strokeWidth={1.75} />}
            action={
              <ButtonLink href="/business/events/new" variant="secondary">
                Create one
              </ButtonLink>
            }
          title="Nothing on the calendar yet."
        />
        ) : (
          <Card className="p-0">
            <ul>
              {data.upcoming.map((event) => (
                <EventListRow key={event.id} event={event} />
              ))}
            </ul>
          </Card>
        )}
      </section>

      {data.needsAttention.length > 0 ? (
        <Card>
          <CardHeader
            title="Needs your attention"
            subtitle="Drafts that are not published yet, and events that have finished."
          />
          <ul className="flex flex-col gap-2">
            {data.needsAttention.map((event) => (
              <li key={event.id} className="text-sm">
                <a className="text-brand hover:underline" href={`/business/events/${event.id}/edit`}>
                  {event.title}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
