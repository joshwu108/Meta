import 'server-only';
import { ApiError } from '@/lib/api/errors';
import type { EventStatus } from '@/shared/enums';

/**
 * The event status diagram from specs/README.md section 2. Mirrored in SQL by
 * `event_transition_allowed()` in supabase/migrations/0500_business.sql; the trigger
 * `events_status_guard` makes sure nothing changes `events.status` without going
 * through an RPC that consults the same table.
 *
 *   proposed -> awaiting_approval -> approved_draft -> published -> full
 *                     |                     |             |   \-> completed
 *                     \-> cancelled         \-> cancelled  \-> cancelled
 */
export const ALLOWED_EVENT_TRANSITIONS = {
  proposed: ['awaiting_approval'],
  awaiting_approval: ['approved_draft', 'cancelled'],
  approved_draft: ['published', 'cancelled'],
  published: ['full', 'completed', 'cancelled'],
  full: ['published', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
} as const satisfies Record<EventStatus, readonly EventStatus[]>;

export const nextEventStatuses = (from: EventStatus): readonly EventStatus[] =>
  ALLOWED_EVENT_TRANSITIONS[from];

export const canTransitionEvent = (from: EventStatus, to: EventStatus): boolean =>
  nextEventStatuses(from).includes(to);

/** Throws `CONFLICT` rather than returning false, for use at the top of a write path. */
export function assertEventTransition(from: EventStatus, to: EventStatus): void {
  if (!canTransitionEvent(from, to)) {
    throw new ApiError('CONFLICT', `${from} -> ${to} is not a legal event transition`);
  }
}

/**
 * The owner-facing cancel action (spec section 5). Narrower than
 * `canTransitionEvent(status, 'cancelled')`: an `awaiting_approval` event is retired by
 * rejecting its proposal, not by the cancel button.
 */
const CANCELLABLE: readonly EventStatus[] = ['approved_draft', 'published', 'full'];
export const isCancellable = (status: EventStatus): boolean => CANCELLABLE.includes(status);

/** Details (title, time, price, capacity) may change until the event is over or cancelled. */
export const isEditable = (status: EventStatus): boolean =>
  status !== 'completed' && status !== 'cancelled';
