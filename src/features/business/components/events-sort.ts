import { EVENT_STATUS } from '@/shared/enums';
import type { BusinessEvent } from '@/shared/types';

/**
 * Ordering for the desktop events table.
 *
 * On a phone the events list stays a stack of cards; from 1024px up the same rows become a
 * table whose columns can be ordered, which is the difference between reading a list and
 * comparing a season of events (design-system.md section 3: the business column exists
 * "for tables").
 */

export const SORT_COLUMNS = ['when', 'title', 'status', 'fill'] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];
export type SortDirection = 'asc' | 'desc';
export type SortState = { column: SortColumn; direction: SortDirection };

export const DEFAULT_SORT: SortState = { column: 'when', direction: 'asc' };

/** How full an event is, so a full table of four outranks a half-empty room of twenty. */
const fillOf = (event: BusinessEvent): number =>
  event.capacity > 0 ? event.confirmedCount / event.capacity : 0;

/** Status sorts along the lifecycle, not alphabetically: a draft comes before a cancellation. */
const statusRank = (event: BusinessEvent): number => EVENT_STATUS.indexOf(event.status);

const compare = (column: SortColumn, a: BusinessEvent, b: BusinessEvent): number => {
  switch (column) {
    case 'when':
      return Date.parse(a.startsAt) - Date.parse(b.startsAt);
    case 'title':
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    case 'status':
      return statusRank(a) - statusRank(b);
    case 'fill':
      return fillOf(a) - fillOf(b);
  }
};

/**
 * A new array, ordered. The input is never touched: it is the server's own list, and two
 * presentations render from it at once.
 */
export function sortEvents(
  events: readonly BusinessEvent[],
  sort: SortState,
): readonly BusinessEvent[] {
  const factor = sort.direction === 'asc' ? 1 : -1;
  // `toSorted` keeps equal rows in the server's order and leaves the input alone.
  return [...events].sort((a, b) => factor * compare(sort.column, a, b));
}

/**
 * Clicking a column either flips it or opens it the way that column reads first: soonest
 * for a date, fullest for a fill bar, A-Z for a title, earliest lifecycle step for status.
 */
export function nextSortState(current: SortState, column: SortColumn): SortState {
  if (current.column === column) {
    return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { column, direction: column === 'fill' ? 'desc' : 'asc' };
}
