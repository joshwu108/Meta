import 'server-only';
import { ApiError } from '@/lib/api/errors';
import type { EventCategory } from '@/shared/enums';
import type { AttendeeList, BusinessEvent, WeeklyHours } from '@/shared/types';
import type { EventInput } from '../schemas';
import type { BusinessDeps } from './deps';
import { buildAttendeeList, buildBusinessEvent, type EventRow } from './dto';
import { assertEventTransition, isCancellable, isEditable } from './status-machine';
import type { EventDetailsPatch } from './store';
import {
  applyEditsToEvent,
  assertCapacityNotBelowConfirmed,
  validateEventAgainstCapabilities,
  type ResolvedEventFields,
} from './validate';
import type { BusinessCapabilities, EventEdits } from '@/shared/types';

/**
 * The event lifecycle (spec section 5). Every status change goes through a store method
 * backed by an RPC; nothing here writes `events.status` directly.
 */

/** Fields whose change forces every confirmed attendee to reconfirm (spec section 5, Update). */
const RECONFIRM_FIELDS = ['startsAt', 'endsAt', 'priceCents', 'capacity'] as const;

async function requireOwnedEvent(
  deps: BusinessDeps,
  businessId: string,
  eventId: string,
): Promise<EventRow> {
  const row = await deps.store.findEvent(eventId);
  // A stranger and another owner are told exactly the same thing (spec section 9, T-I1).
  if (!row || row.business_id !== businessId) {
    throw new ApiError('NOT_FOUND', 'event does not exist');
  }
  return row;
}

const toFields = (row: EventRow): ResolvedEventFields => ({
  title: row.title,
  description: row.description,
  category: row.category as EventCategory,
  format: row.format,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  capacity: row.capacity,
  priceCents: row.price_cents,
});

async function withCount(deps: BusinessDeps, row: EventRow): Promise<BusinessEvent> {
  return buildBusinessEvent(row, await deps.store.countConfirmed(row.id));
}

export async function listBusinessEvents(
  deps: BusinessDeps,
  businessId: string,
): Promise<BusinessEvent[]> {
  const rows = await deps.store.listEventsForBusiness(businessId);
  const counts = await Promise.all(rows.map((row) => deps.store.countConfirmed(row.id)));
  return rows.map((row, index) => buildBusinessEvent(row, counts[index] ?? 0));
}

export async function getBusinessEvent(
  deps: BusinessDeps,
  businessId: string,
  eventId: string,
): Promise<BusinessEvent> {
  return withCount(deps, await requireOwnedEvent(deps, businessId, eventId));
}

export type VenueContext = { capabilities: BusinessCapabilities; hours: WeeklyHours };

/** `POST /api/business/events` — a manual event, published immediately when asked. */
export async function createManualEvent(
  deps: BusinessDeps,
  businessId: string,
  venue: VenueContext,
  input: EventInput,
): Promise<BusinessEvent> {
  const fields: ResolvedEventFields = {
    title: input.title,
    description: input.description,
    category: input.category,
    format: input.format ?? null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    capacity: input.capacity,
    priceCents: input.priceCents ?? null,
  };
  validateEventAgainstCapabilities(fields, venue.capabilities, venue.hours, { timezone: deps.timezone });

  const row = await deps.store.createEvent(
    {
      business_id: businessId,
      proposal_id: null,
      source: 'business_manual',
      title: fields.title,
      description: fields.description,
      category: fields.category,
      format: fields.format,
      starts_at: fields.startsAt,
      ends_at: fields.endsAt,
      capacity: fields.capacity,
      price_cents: fields.priceCents,
    },
    'approved_draft',
  );

  if (!input.publish) return withCount(deps, row);
  return publishBusinessEvent(deps, businessId, row.id);
}

/**
 * `approved_draft -> published`, then the fan-out. For an AI proposal the originating
 * cohort is notified through the service role; their ids never leave this function
 * (privacy invariant 1 and spec section 10 criterion 4).
 */
export async function publishBusinessEvent(
  deps: BusinessDeps,
  businessId: string,
  eventId: string,
): Promise<BusinessEvent> {
  const row = await requireOwnedEvent(deps, businessId, eventId);
  assertEventTransition(row.status as BusinessEvent['status'], 'published');

  await deps.store.publishEvent(eventId);
  const published = await requireOwnedEvent(deps, businessId, eventId);

  await notifyOriginatingCohort(deps, published);
  await deps.logAgentAction({
    actor: 'planning_agent',
    userId: businessId,
    action: 'publish_event',
    permissionsUsed: ['allow_demand_aggregation'],
    result: `planning_agent published "${published.title}"`,
  });

  return withCount(deps, published);
}

async function notifyOriginatingCohort(deps: BusinessDeps, row: EventRow): Promise<void> {
  if (row.source !== 'ai_proposal' || !row.proposal_id) return;
  const proposal = await deps.store.findProposal(row.proposal_id);
  if (!proposal?.cluster_id) return;

  const memberIds = await deps.store.clusterMemberIds(proposal.cluster_id);
  await Promise.all(
    memberIds.map((userId) =>
      deps.notify(userId, 'event_published', {
        eventId: row.id,
        title: row.title,
        body: 'New event near you',
        href: `/events/${row.id}`,
        startsAt: row.starts_at,
      }),
    ),
  );
}

/**
 * Edits to a live event. A change to time, price or capacity makes every confirmed
 * attendee reconfirm; 06 owns the banner and the reconfirm itself.
 */
export async function updateBusinessEvent(
  deps: BusinessDeps,
  businessId: string,
  eventId: string,
  venue: VenueContext,
  edits: EventEdits,
): Promise<BusinessEvent> {
  const row = await requireOwnedEvent(deps, businessId, eventId);
  if (!isEditable(row.status as BusinessEvent['status'])) {
    throw new ApiError('CONFLICT', `a ${row.status} event can no longer be edited`);
  }

  const current = toFields(row);
  const merged = applyEditsToEvent(current, edits);
  validateEventAgainstCapabilities(merged, venue.capabilities, venue.hours, { timezone: deps.timezone });

  const confirmedCount = await deps.store.countConfirmed(eventId);
  if (merged.capacity !== current.capacity) {
    assertCapacityNotBelowConfirmed(merged.capacity, confirmedCount);
  }

  const changed = RECONFIRM_FIELDS.filter((field) => merged[field] !== current[field]);
  const patch: EventDetailsPatch = {
    ...(merged.title !== current.title ? { title: merged.title } : {}),
    ...(merged.description !== current.description ? { description: merged.description } : {}),
    ...(merged.format !== current.format ? { format: merged.format } : {}),
    ...(merged.startsAt !== current.startsAt ? { starts_at: merged.startsAt } : {}),
    ...(merged.endsAt !== current.endsAt ? { ends_at: merged.endsAt } : {}),
    ...(merged.capacity !== current.capacity ? { capacity: merged.capacity } : {}),
    ...(merged.priceCents !== current.priceCents ? { price_cents: merged.priceCents } : {}),
  };

  if (Object.keys(patch).length === 0) return withCount(deps, row);
  const updated = await deps.store.updateEventDetails(eventId, patch);

  if (changed.length > 0 && confirmedCount > 0) {
    const userIds = await deps.store.confirmedRsvpUserIds(eventId);
    await Promise.all(
      userIds.map((userId) =>
        deps.notify(userId, 'event_updated', {
          eventId,
          title: updated.title,
          body: 'Details changed. Please reconfirm your spot.',
          href: `/events/${eventId}`,
          changed,
          startsAt: updated.starts_at,
        }),
      ),
    );
  }

  return withCount(deps, updated);
}

/** Cancelling needs a reason, and every confirmed attendee hears about it. */
export async function cancelBusinessEvent(
  deps: BusinessDeps,
  businessId: string,
  eventId: string,
  reason: string,
): Promise<BusinessEvent> {
  const row = await requireOwnedEvent(deps, businessId, eventId);
  if (!isCancellable(row.status as BusinessEvent['status'])) {
    throw new ApiError('CONFLICT', `a ${row.status} event cannot be cancelled`);
  }

  const userIds = await deps.store.confirmedRsvpUserIds(eventId);
  await deps.store.cancelEvent(eventId, reason);
  const cancelled = await requireOwnedEvent(deps, businessId, eventId);

  await Promise.all(
    userIds.map((userId) =>
      deps.notify(userId, 'event_cancelled', {
        eventId,
        title: cancelled.title,
        body: `Cancelled: ${reason}`,
        href: `/events/${eventId}`,
        reason,
      }),
    ),
  );

  return withCount(deps, cancelled);
}

/** Counts always; names only for attendees who consented (spec section 6). */
export async function getEventAttendees(
  deps: BusinessDeps,
  businessId: string,
  eventId: string,
): Promise<AttendeeList> {
  await requireOwnedEvent(deps, businessId, eventId);
  return buildAttendeeList(await deps.store.listRsvps(eventId));
}
