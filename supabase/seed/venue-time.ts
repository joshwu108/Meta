/**
 * Pure venue-time helpers for the seed (no `server-only`, so `tsx` can run them).
 * Fixture times are the venue's wall clock, so they are resolved in the venue's timezone, not
 * the seeding machine's, which keeps demo data identical on every machine and DST-correct.
 */
export const SEED_TIMEZONE = process.env.VENUE_TIMEZONE ?? 'America/Los_Angeles';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type VenueHours = Partial<Record<string, ReadonlyArray<readonly [string, string]>>>;
export type CalendarDate = { year: number; month: number; day: number };

function partsIn(timezone: string, at: Date): Record<string, number> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  return Object.fromEntries(
    formatter.formatToParts(at).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]),
  );
}

/** The calendar date `timezone` reads at instant `at`. */
export function dateInZone(timezone: string, at: Date): CalendarDate {
  const p = partsIn(timezone, at);
  return { year: p.year!, month: p.month!, day: p.day! };
}

/** Add whole days to a calendar date (no timezone involved). */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function weekdayOf(date: CalendarDate): Weekday {
  return WEEKDAYS[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()]!;
}

/** The instant at which `timezone` reads `hour:minute` on `date` (two passes for DST edges). */
export function zonedToUtc(timezone: string, date: CalendarDate, hour: number, minute = 0): Date {
  const target = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  const offset = (at: number) => {
    const p = partsIn(timezone, new Date(at));
    return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - Math.floor(at / 1000) * 1000;
  };
  let instant = target - offset(target);
  instant = target - offset(instant);
  return new Date(instant);
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** True when one of the venue's intervals on `weekday` covers the whole event. No hours = always open. */
export function isOpen(hours: VenueHours | undefined, weekday: Weekday, startHour: number, durationHours: number): boolean {
  if (!hours) return true;
  const start = startHour * 60;
  const end = start + durationHours * 60;
  return (hours[weekday] ?? []).some(([open, close]) => toMinutes(open) <= start && end <= toMinutes(close));
}

export type EventTimeInput = { daysFromNow: number; startHour: number; durationHours: number; hours?: VenueHours };

/**
 * Start and end instants for a seeded event: `daysFromNow` days after today in the venue's
 * timezone, moved forward (at most a week) to the first day the venue is open for the whole event.
 */
export function seedEventTimes(input: EventTimeInput, now = new Date(), timezone = SEED_TIMEZONE): { startsAt: string; endsAt: string } {
  let date = addDays(dateInZone(timezone, now), input.daysFromNow);
  for (let i = 0; i < 7 && !isOpen(input.hours, weekdayOf(date), input.startHour, input.durationHours); i += 1) {
    date = addDays(date, 1);
  }
  const start = zonedToUtc(timezone, date, input.startHour);
  const end = new Date(start.getTime() + input.durationHours * 3_600_000);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}
