'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import { AiTag, CapacityMeter, StatusPill } from '@/features/core/components/ui';
import type { BusinessEvent } from '@/shared/types';
import { CATEGORY_LABEL } from '../labels';
import { formatDateTime, formatPrice } from '../format';
import { EventRowActions } from './EventRowActions';
import {
  DEFAULT_SORT,
  nextSortState,
  sortEvents,
  type SortColumn,
  type SortState,
} from './events-sort';

/**
 * The events table, shown from 1280px up (design-system.md section 3: the business column is
 * "960px for tables"). The card list in `EventListRow` stays the narrower presentation —
 * same rows, same data, read two ways: a stack you scroll on a phone, columns you compare on
 * a desktop. 1280 rather than 1024 because these columns need ~810px and a 1024px window
 * leaves the business column only ~696px.
 */

const COLUMNS: ReadonlyArray<{ key: SortColumn | null; label: string; className?: string }> = [
  { key: 'status', label: 'Status', className: 'w-[116px]' },
  { key: 'title', label: 'Event' },
  { key: 'when', label: 'When', className: 'w-[180px]' },
  { key: null, label: 'Category', className: 'w-[120px]' },
  { key: null, label: 'Price', className: 'w-[84px]' },
  { key: 'fill', label: 'Fill', className: 'w-[160px]' },
  { key: null, label: 'Actions', className: 'w-[150px]' },
];

/** `aria-sort` has to say which way, so a screen reader announces the order, not just that one exists. */
const ariaSort = (sort: SortState, column: SortColumn | null): 'ascending' | 'descending' | 'none' => {
  if (column === null || sort.column !== column) return 'none';
  return sort.direction === 'asc' ? 'ascending' : 'descending';
};

export function EventsTable({ events }: { events: readonly BusinessEvent[] }) {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const rows = sortEvents(events, sort);

  return (
    <table className="w-full table-fixed border-collapse text-left">
      <caption className="sr-only">
        Your events, sortable by status, name, date and how full they are.
      </caption>
      <thead>
        <tr className="border-b border-border-subtle">
          {COLUMNS.map((column) => (
            <th
              key={column.label}
              scope="col"
              aria-sort={ariaSort(sort, column.key)}
              className={`px-3 py-2 text-[length:var(--text-sm)] font-semibold text-text-2 ${column.className ?? ''}`}
            >
              {column.key === null ? (
                column.label
              ) : (
                <button
                  type="button"
                  onClick={() => setSort(nextSortState(sort, column.key as SortColumn))}
                  className="inline-flex items-center gap-1 rounded-sm hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {column.label}
                  {sort.column === column.key ? (
                    sort.direction === 'asc' ? (
                      <ArrowUp aria-hidden size={14} strokeWidth={2} />
                    ) : (
                      <ArrowDown aria-hidden size={14} strokeWidth={2} />
                    )
                  ) : (
                    <ChevronsUpDown aria-hidden size={14} strokeWidth={1.75} className="text-text-3" />
                  )}
                </button>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((event) => (
          <tr key={event.id} className="border-b border-border-subtle last:border-b-0">
            <td className="px-3 py-3 align-middle">
              <StatusPill status={event.status} />
            </td>
            <td className="px-3 py-3 align-middle">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-semibold">{event.title}</span>
                {event.source === 'ai_proposal' ? <AiTag label="AI suggestion" /> : null}
              </div>
            </td>
            <td className="px-3 py-3 align-middle text-[length:var(--text-sm)] text-text-2">
              {formatDateTime(event.startsAt)}
            </td>
            <td className="px-3 py-3 align-middle text-[length:var(--text-sm)] text-text-2">
              {CATEGORY_LABEL[event.category]}
            </td>
            <td className="px-3 py-3 align-middle text-[length:var(--text-sm)] text-text-2">
              {formatPrice(event.priceCents)}
            </td>
            <td className="px-3 py-3 align-middle">
              <CapacityMeter confirmed={event.confirmedCount} capacity={event.capacity} />
            </td>
            <td className="px-3 py-3 align-middle">
              <EventRowActions event={event} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
