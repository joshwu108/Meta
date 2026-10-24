import "server-only";
import type { AvailabilitySlot } from "@/shared/enums";

/** Every event time is stored in UTC; slots are always derived in the city's local time. */
export const EVENT_TIME_ZONE = "America/Los_Angeles";

/** Local hour at which an evening slot starts. */
const EVENING_START_HOUR = 17;
/** Events before this local hour count as the previous night's evening (e.g. a 1 AM board-game marathon). */
const LATE_NIGHT_END_HOUR = 5;

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const EVENING_SLOTS: readonly AvailabilitySlot[] = [
  "sun_eve", "mon_eve", "tue_eve", "wed_eve", "thu_eve", "fri_eve", "sat_eve",
];

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EVENT_TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export type LocalParts = { weekday: number; hour: number; minute: number };

/** Weekday (0 = Sunday), hour and minute of an instant in {@link EVENT_TIME_ZONE}. */
export function localParts(instant: string | Date): LocalParts {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid timestamp: ${String(instant)}`);
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    weekday: WEEKDAY_INDEX[parts.weekday ?? ""] ?? 0,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/**
 * Maps an event start time to the availability slot a user would pick for it,
 * or null for weekday daytime events, which no slot covers.
 */
export function deriveSlot(startsAt: string | Date): AvailabilitySlot | null {
  const { weekday, hour } = localParts(startsAt);
  if (hour < LATE_NIGHT_END_HOUR) return EVENING_SLOTS[(weekday + 6) % 7] ?? null;
  if (hour >= EVENING_START_HOUR) return EVENING_SLOTS[weekday] ?? null;
  if (weekday === 6) return "sat_day";
  if (weekday === 0) return "sun_day";
  return null;
}
