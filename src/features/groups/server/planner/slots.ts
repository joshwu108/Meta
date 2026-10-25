import type { AvailabilitySlot } from '@/shared/enums';

/** Event times are stored in UTC; slots are read in the venue's city (same rule as workstream 06). */
export const PLANNER_TIME_ZONE = 'America/Los_Angeles';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type Day = (typeof DAYS)[number];
const EVENING_FROM_HOUR = 17;
const LATE_NIGHT_UNTIL_HOUR = 5;

function localDayAndHour(date: Date, timeZone: string): { day: Day; hour: number } | null {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value.toLowerCase().slice(0, 3);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const day = DAYS.find((d) => d === weekday);
  return day && Number.isFinite(hour) ? { day, hour } : null;
}

/**
 * Availability slot for an event start: 17:00 and later is that day's evening, 00:00–04:59 counts
 * as the previous evening, Saturday/Sunday before 17:00 is the day slot, weekday daytime has none.
 */
export function slotForStart(iso: string, timeZone: string = PLANNER_TIME_ZONE): AvailabilitySlot | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const local = localDayAndHour(date, timeZone);
  if (!local) return null;
  if (local.hour < LATE_NIGHT_UNTIL_HOUR) {
    const previous = DAYS[(DAYS.indexOf(local.day) + DAYS.length - 1) % DAYS.length]!;
    return `${previous}_eve` as AvailabilitySlot;
  }
  if (local.hour >= EVENING_FROM_HOUR) return `${local.day}_eve` as AvailabilitySlot;
  if (local.day === 'sat' || local.day === 'sun') return `${local.day}_day` as AvailabilitySlot;
  return null;
}
