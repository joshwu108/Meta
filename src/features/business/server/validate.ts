import 'server-only';
import { ApiError } from '@/lib/api/errors';
import type { EventCategory } from '@/shared/enums';
import type { BusinessCapabilities, EventEdits, ProposalDocument, WeeklyHours } from '@/shared/types';
import {
  VENUE_TIMEZONE,
  minutesSinceMidnight,
  nextSlotOccurrence,
  parseTimeOfDay,
  weekdayKeyOf,
} from './time';

/**
 * Spec section 5: an approved proposal becomes an event only after the merged details pass
 * the venue's own capabilities. These functions are pure so the rules stay unit-testable
 * without a database (spec section 9, T-U2 and T-U3).
 */

export type ResolvedEventFields = {
  title: string;
  description: string;
  category: EventCategory;
  format: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  priceCents: number | null;
};

export type ResolveOptions = { from?: Date; timezone?: string };

const MINUTE_MS = 60_000;

/** Proposal document + owner edits -> the concrete fields an `events` row needs. */
export function resolveEventFromProposal(
  proposal: ProposalDocument,
  edits: EventEdits | undefined,
  options: ResolveOptions = {},
): ResolvedEventFields {
  const startsAt =
    edits?.startsAt ??
    nextSlotOccurrence(proposal.suggestedSlot, proposal.suggestedStartTimeLocal, options).toISOString();

  const endsAt =
    edits?.endsAt ??
    new Date(new Date(startsAt).getTime() + proposal.estimatedDurationMinutes * MINUTE_MS).toISOString();

  return {
    title: edits?.title ?? proposal.title,
    description: edits?.description ?? proposal.description,
    category: proposal.category,
    format: edits?.format ?? proposal.format,
    startsAt,
    endsAt,
    capacity: edits?.capacity ?? proposal.suggestedCapacity,
    priceCents: edits?.priceCents !== undefined ? edits.priceCents : proposal.suggestedPriceCents,
  };
}

/** Apply owner edits to an event that already exists. */
export function applyEditsToEvent(
  current: ResolvedEventFields,
  edits: EventEdits,
): ResolvedEventFields {
  return {
    ...current,
    ...(edits.title !== undefined ? { title: edits.title } : {}),
    ...(edits.description !== undefined ? { description: edits.description } : {}),
    ...(edits.format !== undefined ? { format: edits.format } : {}),
    ...(edits.startsAt !== undefined ? { startsAt: edits.startsAt } : {}),
    ...(edits.endsAt !== undefined ? { endsAt: edits.endsAt } : {}),
    ...(edits.capacity !== undefined ? { capacity: edits.capacity } : {}),
    ...(edits.priceCents !== undefined ? { priceCents: edits.priceCents } : {}),
  };
}

export type ValidationProblem = { field: string; message: string };

function hoursProblems(
  fields: ResolvedEventFields,
  hours: WeeklyHours,
  timezone: string,
): ValidationProblem[] {
  // A venue that has published no hours is not held to any (onboarding allows skipping them).
  if (Object.keys(hours).length === 0) return [];

  const start = new Date(fields.startsAt);
  const end = new Date(fields.endsAt);
  const weekday = weekdayKeyOf(timezone, start);
  const windows = hours[weekday] ?? [];

  if (windows.length === 0) {
    return [{ field: 'startsAt', message: `the venue is closed on ${weekday}` }];
  }

  const startMinutes = minutesSinceMidnight(timezone, start);
  // Measured from the start so an event running past midnight does not wrap to 00:10.
  const endMinutes = startMinutes + Math.round((end.getTime() - start.getTime()) / MINUTE_MS);

  const fits = windows.some(([open, close]) => {
    const openMinutes = parseTimeOfDay(open);
    const closeMinutes = parseTimeOfDay(close);
    return startMinutes >= openMinutes && endMinutes <= closeMinutes;
  });

  if (fits) return [];

  const readable = windows.map(([open, close]) => `${open}-${close}`).join(', ');
  return [
    {
      field: 'startsAt',
      message: `the venue is open ${readable} on ${weekday}; this event falls outside that`,
    },
  ];
}

/** Throws a single `VALIDATION` error whose `details` list every problem found. */
export function validateEventAgainstCapabilities(
  fields: ResolvedEventFields,
  capabilities: BusinessCapabilities,
  hours: WeeklyHours,
  options: { timezone?: string } = {},
): void {
  const timezone = options.timezone ?? VENUE_TIMEZONE;
  const problems: ValidationProblem[] = [];

  if (new Date(fields.endsAt).getTime() <= new Date(fields.startsAt).getTime()) {
    problems.push({ field: 'endsAt', message: 'an event must end after it starts' });
  }
  if (fields.capacity > capabilities.capacity) {
    problems.push({
      field: 'capacity',
      message: `this venue can host ${capabilities.capacity} people, not ${fields.capacity}`,
    });
  }
  if (!capabilities.eventCategories.includes(fields.category)) {
    problems.push({
      field: 'category',
      message: `this venue does not host ${fields.category} events`,
    });
  }
  problems.push(...hoursProblems(fields, hours, timezone));

  if (problems.length > 0) {
    throw new ApiError(
      'VALIDATION',
      `these details do not fit the venue: ${problems.map((p) => p.message).join('; ')}`,
      422,
      problems,
    );
  }
}

/**
 * Spec section 5, Update: a capacity decrease below the number of people already confirmed
 * is rejected rather than silently bumping someone off the list.
 */
export function assertCapacityNotBelowConfirmed(capacity: number, confirmedCount: number): void {
  if (capacity < confirmedCount) {
    throw new ApiError(
      'VALIDATION',
      `${confirmedCount} people have already confirmed, so capacity cannot drop to ${capacity}`,
      422,
      [{ field: 'capacity', message: `capacity cannot be lower than ${confirmedCount}` }],
    );
  }
}
