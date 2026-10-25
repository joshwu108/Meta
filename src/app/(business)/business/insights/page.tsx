import { Lightbulb } from 'lucide-react';
import { AiTag, CapacityMeter, Card, CardHeader, EmptyState } from '@/features/core/components/ui';
import { EstimatePopover } from '@/features/business/components/EstimatePopover';
import { formatDay } from '@/features/business/format';
import { BAND_LABEL, CATEGORY_LABEL, SLOT_LABEL } from '@/features/business/labels';
import { InsightsGrid } from '@/features/business/components/InsightsGrid';
import { StatRow } from '@/features/business/components/StatRow';
import { getBusinessAnalytics } from '@/features/business/server/analytics';
import { getBusinessInsights } from '@/features/business/server/insights';
import { requireBusinessPage } from '@/features/business/server/page-data';
import { AVAILABILITY_SLOT } from '@/shared/enums';

export const dynamic = 'force-dynamic';

/**
 * P1 `/business/insights` (spec section 3): banded community interest by category and slot
 * within 3 km over the last 30 days. Every cell is a band; there is no raw number on this
 * page by construction.
 */
export default async function BusinessInsightsPage() {
  const { deps, business } = await requireBusinessPage();
  const [insights, analytics] = await Promise.all([
    getBusinessInsights(deps, business.id),
    getBusinessAnalytics(deps, business.id),
  ]);

  const byCategory = insights.cells.reduce<Map<string, typeof insights.cells>>((acc, cell) => {
    const current = acc.get(cell.category) ?? [];
    return new Map(acc).set(cell.category, [...current, cell]);
  }, new Map());

  return (
    <div className="flex flex-col gap-5">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold leading-tight">Local interest</h1>
          <AiTag label="Estimate" />
        </div>
        <p className="mt-1 max-w-prose text-sm text-text-2">
          What people within {insights.withinKm} km who opted in have shown interest in over the
          last {insights.sinceDays} days, as ranges. Never a precise count, never a name.
        </p>
        <div className="mt-2">
          <EstimatePopover />
        </div>
      </header>

      {insights.cells.length === 0 ? (
        <EmptyState icon={<Lightbulb aria-hidden size={24} strokeWidth={1.75} />} title="Not enough opted-in interest nearby to show a range yet. Small groups are never shown, to protect the people in them." />
      ) : (
        <>
        {/* Desktop reads the whole week at once; the phone keeps the per-category list. */}
        <Card className="hidden overflow-x-auto p-3 xl:block">
          <InsightsGrid cells={insights.cells} />
        </Card>
        <div className="flex flex-col gap-3 xl:hidden">
          {[...byCategory.entries()].map(([category, cells]) => (
            <Card key={category}>
              <CardHeader title={CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL]} />
              <ul className="flex flex-col divide-y divide-border-subtle">
                {[...cells]
                  .sort(
                    (a, b) =>
                      AVAILABILITY_SLOT.indexOf(a.slot) - AVAILABILITY_SLOT.indexOf(b.slot),
                  )
                  .map((cell) => (
                    <li key={cell.slot} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-base">{SLOT_LABEL[cell.slot]}</span>
                      <span className="inline-flex h-6 items-center rounded-pill bg-brand-soft px-2 text-[length:var(--text-xs)] font-semibold text-brand">
                        {BAND_LABEL[cell.band]} interested
                      </span>
                    </li>
                  ))}
              </ul>
            </Card>
          ))}
        </div>
        </>
      )}

      {/* P1 analytics: how the venue's own past events went. Counts only. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Your past events</h2>
        <StatRow
          items={[
            { label: 'Events hosted', value: analytics.pastEvents },
            { label: 'People who came', value: analytics.totalAttendance },
            {
              label: 'Came back again',
              value: analytics.repeatAttendees,
              hint: 'A count only; we never say who',
            },
          ]}
        />

        {analytics.recent.length === 0 ? (
          <EmptyState icon={<Lightbulb aria-hidden size={24} strokeWidth={1.75} />} title="Once an event has finished, how it went shows up here." />
        ) : (
          <Card className="p-0">
            <div className="p-4 pb-2">
              <CardHeader
                title="How they filled up"
                subtitle={`Average ${Math.round(analytics.averageFillRate * 100)}% of capacity across ${
                  analytics.pastEvents
                } ${analytics.pastEvents === 1 ? 'event' : 'events'}.`}
              />
            </div>
            <ul>
              {analytics.recent.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-col gap-2 border-t border-border-subtle px-4 py-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium">{event.title}</p>
                    <p className="text-sm text-text-2">{formatDay(event.startsAt)}</p>
                  </div>
                  <div className="w-full sm:w-44">
                    <CapacityMeter confirmed={event.confirmedCount} capacity={event.capacity} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {analytics.byCategory.length > 1 ? (
          <Card>
            <CardHeader title="By category" />
            <ul className="flex flex-col divide-y divide-border-subtle">
              {analytics.byCategory.map((row) => (
                <li key={row.category} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-base">{CATEGORY_LABEL[row.category]}</span>
                  <span className="text-sm tabular-nums text-text-2">
                    {row.events} {row.events === 1 ? 'event' : 'events'} · {row.attendance} attended
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
