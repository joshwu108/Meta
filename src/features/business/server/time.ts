import 'server-only';
import type { AvailabilitySlot } from '@/shared/enums';
import type { WeekdayKey } from '@/shared/types';

/**
 * Venue wall-clock helpers. A proposal from workstream 04 carries a slot
 * (`thu_eve`) and a local start time (`18:30`), never an instant, so 05 resolves
 * the next matching occurrence in the venue's timezone before writing `events`.
 *
 * No date library: `Intl.DateTimeFormat` already knows every offset and DST rule.
 */

export const VENUE_TIMEZONE = process.env.VENUE_TIMEZONE ?? 'America/Los_Angeles';

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const SLOT_WEEKDAY = {
  mon_eve: 'mon',
  tue_eve: 'tue',
  wed_eve: 'wed',
  thu_eve: 'thu',
  fri_eve: 'fri',
  sat_day: 'sat',
  sat_eve: 'sat',
  sun_day: 'sun',
  sun_eve: 'sun',
} as const satisfies Record<AvailabilitySlot, WeekdayKey>;

export const slotWeekday = (slot: AvailabilitySlot): WeekdayKey => SLOT_WEEKDAY[slot];

export type WallTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: WeekdayKey;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatterCache.set(timezone, formatter);
  return formatter;
}

/** The wall clock a viewer in `timezone` reads at instant `at`. */
export function wallTimeInZone(timezone: string, at: Date): WallTime {
  const parts = formatterFor(timezone).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  const utcMidnightOfLocalDay = Date.UTC(read('year'), read('month') - 1, read('day'));
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    weekday: WEEKDAY_KEYS[new Date(utcMidnightOfLocalDay).getUTCDay()] as WeekdayKey,
  };
}

export const weekdayKeyOf = (timezone: string, at: Date): WeekdayKey =>
  wallTimeInZone(timezone, at).weekday;

/** Minutes that `timezone` is ahead of UTC at instant `at`. */
function offsetMinutes(timezone: string, at: Date): number {
  const wall = wallTimeInZone(timezone, at);
  const parts = formatterFor(timezone).formatToParts(at);
  const second = Number(parts.find((p) => p.type === 'second')?.value ?? 0);
  const asIfUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, second);
  return (asIfUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000;
}

/**
 * The instant at which `timezone` reads the given wall clock time. Two passes: the first
 * offset guess can be wrong within an hour of a DST change, the second is taken at the
 * corrected instant.
 */
export function zonedWallTimeToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let instant = target - offsetMinutes(timezone, new Date(target)) * 60_000;
  instant = target - offsetMinutes(timezone, new Date(instant)) * 60_000;
  return new Date(instant);
}

export type SlotOptions = { from?: Date; timezone?: string };

/**
 * The next instant, strictly after `from`, at which the venue's clock reads `startTimeLocal`
 * on the slot's weekday.
 */
export function nextSlotOccurrence(
  slot: AvailabilitySlot,
  startTimeLocal: string,
  options: SlotOptions = {},
): Date {
  const timezone = options.timezone ?? VENUE_TIMEZONE;
  const from = options.from ?? new Date();
  const [hourPart, minutePart] = startTimeLocal.split(':');
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error(`expected HH:MM, received "${startTimeLocal}"`);
  }

  const wanted = slotWeekday(slot);
  const today = wallTimeInZone(timezone, from);

  for (let offset = 0; offset <= 7; offset += 1) {
    const dayStart = Date.UTC(today.year, today.month - 1, today.day + offset);
    const candidateDay = new Date(dayStart);
    const weekday = WEEKDAY_KEYS[candidateDay.getUTCDay()];
    if (weekday !== wanted) continue;
    const candidate = zonedWallTimeToUtc(
      timezone,
      candidateDay.getUTCFullYear(),
      candidateDay.getUTCMonth() + 1,
      candidateDay.getUTCDate(),
      hour,
      minute,
    );
    if (candidate.getTime() > from.getTime()) return candidate;
  }

  throw new Error(`no ${wanted} occurrence found within eight days of ${from.toISOString()}`);
}

export const minutesSinceMidnight = (timezone: string, at: Date): number => {
  const wall = wallTimeInZone(timezone, at);
  return wall.hour * 60 + wall.minute;
};

export const parseTimeOfDay = (value: string): number => {
  const [hour, minute] = value.split(':');
  return Number(hour) * 60 + Number(minute);
};
