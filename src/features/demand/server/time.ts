import type { AvailabilitySlot } from '@/shared/enums';

export const VENUE_TIME_ZONE = 'America/Los_Angeles';

const SLOT_WEEKDAY: Readonly<Record<AvailabilitySlot, number>> = {
  mon_eve: 1, tue_eve: 2, wed_eve: 3, thu_eve: 4, fri_eve: 5, sat_day: 6, sat_eve: 6, sun_day: 0, sun_eve: 0,
};

const DAY_MS = 86_400_000;

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function zonedParts(instant: Date, timeZone: string): Parts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  });
  const get = (type: string) => fmt.formatToParts(instant).find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')), month: Number(get('month')), day: Number(get('day')),
    hour: Number(get('hour')), minute: Number(get('minute')), weekday: WEEKDAYS.indexOf(get('weekday')),
  };
}

/** UTC instant for a wall-clock time in `timeZone` (two-pass offset correction handles DST). */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let utc = guess;
  for (let i = 0; i < 2; i += 1) {
    const p = zonedParts(new Date(utc), timeZone);
    const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    utc += guess - asIfUtc;
  }
  return new Date(utc);
}

/**
 * Spec §5.8: next occurrence of `slot`'s weekday at `hhmm` venue-local time, at least `minDaysOut`
 * calendar days after `now`.
 */
export function nextSlotStart(slot: AvailabilitySlot, hhmm: string, now: Date, minDaysOut: number, timeZone = VENUE_TIME_ZONE): Date {
  const [hour, minute] = hhmm.split(':').map(Number) as [number, number];
  const target = SLOT_WEEKDAY[slot];
  for (let offset = minDaysOut; offset < minDaysOut + 7; offset += 1) {
    const p = zonedParts(new Date(now.getTime() + offset * DAY_MS), timeZone);
    if (p.weekday === target) return zonedTimeToUtc(p.year, p.month, p.day, hour, minute, timeZone);
  }
  throw new Error(`no ${slot} within a week of ${minDaysOut} days out`);
}

export function weekdayInZone(instant: Date, timeZone = VENUE_TIME_ZONE): number {
  return zonedParts(instant, timeZone).weekday;
}

export function localTimeInZone(instant: Date, timeZone = VENUE_TIME_ZONE): string {
  const p = zonedParts(instant, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
