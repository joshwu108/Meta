import { describe, expect, it } from 'vitest';
import type { BusinessEvent } from '@/shared/types';
import { SORT_COLUMNS, nextSortState, sortEvents, type SortState } from '@/features/business/components/events-sort';

/**
 * Sorting for the desktop events table (design-system.md section 3: the business column is
 * "960px for tables"). An owner comparing a season of events wants columns they can order,
 * which is the whole difference between a list and an analysis.
 */

const event = (over: Partial<BusinessEvent>): BusinessEvent => ({
  id: 'evt', businessId: 'biz', proposalId: null, source: 'business_manual',
  title: 'Untitled', description: '', category: 'creative', format: null,
  startsAt: '2026-11-05T18:00:00.000Z', endsAt: '2026-11-05T20:00:00.000Z',
  capacity: 10, priceCents: 1000, status: 'published',
  publishedAt: null, cancelledAt: null, cancelReason: null, confirmedCount: 0,
  ...over,
});

const titles = (rows: readonly BusinessEvent[]): string[] => rows.map((row) => row.title);

describe('sortEvents', () => {
  it('orders by start time, soonest first, by default', () => {
    const rows = [
      event({ title: 'later', startsAt: '2026-12-01T18:00:00.000Z' }),
      event({ title: 'sooner', startsAt: '2026-11-01T18:00:00.000Z' }),
    ];

    expect(titles(sortEvents(rows, { column: 'when', direction: 'asc' }))).toEqual(['sooner', 'later']);
  });

  it('never mutates the array it was given', () => {
    const rows = [
      event({ title: 'b', startsAt: '2026-12-01T18:00:00.000Z' }),
      event({ title: 'a', startsAt: '2026-11-01T18:00:00.000Z' }),
    ];
    const before = titles(rows);

    sortEvents(rows, { column: 'when', direction: 'asc' });

    expect(titles(rows)).toEqual(before);
  });

  it('orders fill by how full the event is, not by headcount', () => {
    const rows = [
      event({ title: 'half of twenty', capacity: 20, confirmedCount: 10 }),
      event({ title: 'nearly full small', capacity: 4, confirmedCount: 4 }),
    ];

    // 4/4 is fuller than 10/20 even though 10 is the bigger number.
    expect(titles(sortEvents(rows, { column: 'fill', direction: 'desc' }))).toEqual([
      'nearly full small',
      'half of twenty',
    ]);
  });

  it('orders status along the event lifecycle rather than alphabetically', () => {
    const rows = [
      event({ title: 'cancelled', status: 'cancelled' }),
      event({ title: 'draft', status: 'approved_draft' }),
      event({ title: 'published', status: 'published' }),
    ];

    expect(titles(sortEvents(rows, { column: 'status', direction: 'asc' }))).toEqual([
      'draft',
      'published',
      'cancelled',
    ]);
  });

  it('sorts titles case-insensitively', () => {
    const rows = [event({ title: 'beta' }), event({ title: 'Alpha' })];

    expect(titles(sortEvents(rows, { column: 'title', direction: 'asc' }))).toEqual(['Alpha', 'beta']);
  });

  it('keeps equal rows in their original order', () => {
    const rows = [event({ title: 'first' }), event({ title: 'second' })];

    // Same start time: a stable sort leaves the server's ordering alone.
    expect(titles(sortEvents(rows, { column: 'when', direction: 'asc' }))).toEqual(['first', 'second']);
  });

  it('reverses every column when the direction flips', () => {
    // Every column must discriminate these two rows, otherwise a stable sort keeps equal
    // rows in place in both directions and reversal would not apply.
    const rows = [
      event({ title: 'a', startsAt: '2026-11-01T18:00:00.000Z', capacity: 10, confirmedCount: 1, status: 'approved_draft' }),
      event({ title: 'b', startsAt: '2026-12-01T18:00:00.000Z', capacity: 10, confirmedCount: 9, status: 'completed' }),
    ];

    for (const column of SORT_COLUMNS) {
      const asc = titles(sortEvents(rows, { column, direction: 'asc' }));
      const desc = titles(sortEvents(rows, { column, direction: 'desc' }));
      expect(desc, column).toEqual([...asc].reverse());
    }
  });
});

describe('nextSortState', () => {
  const current: SortState = { column: 'when', direction: 'asc' };

  it('flips direction when the same column is clicked again', () => {
    expect(nextSortState(current, 'when')).toEqual({ column: 'when', direction: 'desc' });
  });

  it('starts a new column in the direction that reads first', () => {
    // Soonest first for a date, but fullest and A-Z first for the others.
    expect(nextSortState(current, 'fill')).toEqual({ column: 'fill', direction: 'desc' });
    expect(nextSortState(current, 'title')).toEqual({ column: 'title', direction: 'asc' });
  });
});
