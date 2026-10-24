import { describe, expect, it } from 'vitest';
import { EVENT_STATUS, type EventStatus } from '@/shared/enums';
import {
  ALLOWED_EVENT_TRANSITIONS,
  assertEventTransition,
  canTransitionEvent,
  isCancellable,
  isEditable,
  nextEventStatuses,
} from '@/features/business/server/status-machine';

/**
 * Spec section 9, T-U1: every illegal transition is rejected. The table below is the
 * transition diagram in specs/README.md section 2, written out once so the test and the
 * implementation cannot drift silently.
 */
const LEGAL: ReadonlyArray<readonly [EventStatus, EventStatus]> = [
  ['proposed', 'awaiting_approval'],
  ['awaiting_approval', 'approved_draft'],
  ['awaiting_approval', 'cancelled'],
  ['approved_draft', 'published'],
  ['approved_draft', 'cancelled'],
  ['published', 'full'],
  ['published', 'completed'],
  ['published', 'cancelled'],
  ['full', 'published'],
  ['full', 'completed'],
  ['full', 'cancelled'],
];

const isLegal = (from: EventStatus, to: EventStatus) =>
  LEGAL.some(([f, t]) => f === from && t === to);

describe('event status machine', () => {
  it('accepts exactly the transitions in the spec diagram', () => {
    for (const [from, to] of LEGAL) {
      expect(canTransitionEvent(from, to), `${from} -> ${to} should be legal`).toBe(true);
    }
  });

  it('rejects every transition outside the diagram, including self-transitions', () => {
    for (const from of EVENT_STATUS) {
      for (const to of EVENT_STATUS) {
        if (isLegal(from, to)) continue;
        expect(canTransitionEvent(from, to), `${from} -> ${to} should be illegal`).toBe(false);
      }
    }
  });

  it('treats completed and cancelled as terminal', () => {
    expect(nextEventStatuses('completed')).toEqual([]);
    expect(nextEventStatuses('cancelled')).toEqual([]);
  });

  it('exposes the same table it validates against', () => {
    const flat = Object.entries(ALLOWED_EVENT_TRANSITIONS).flatMap(([from, tos]) =>
      tos.map((to) => `${from}->${to}`),
    );
    expect(new Set(flat)).toEqual(new Set(LEGAL.map(([f, t]) => `${f}->${t}`)));
  });

  it('throws a CONFLICT ApiError on an illegal transition', () => {
    expect(() => assertEventTransition('completed', 'published')).toThrowError(
      /completed -> published/,
    );
    try {
      assertEventTransition('cancelled', 'published');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('CONFLICT');
    }
  });

  it('does not throw on a legal transition', () => {
    expect(() => assertEventTransition('approved_draft', 'published')).not.toThrow();
  });

  it('allows cancelling only an approved draft, published or full event', () => {
    const cancellable = EVENT_STATUS.filter(isCancellable);
    expect(cancellable).toEqual(['approved_draft', 'published', 'full']);
  });

  it('allows editing details only before the event is over or cancelled', () => {
    const editable = EVENT_STATUS.filter(isEditable);
    expect(editable).toEqual(['proposed', 'awaiting_approval', 'approved_draft', 'published', 'full']);
  });
});
