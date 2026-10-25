/** Date, time and money formatting for the business screens. Shared by server and client. */
import { VENUE_TIMEZONE, wallTimeInZone, zonedWallTimeToUtc } from './venue-time';

export const VENUE_LOCALE = 'en-US';

/**
 * Every time on the business screens is the **venue's** wall clock.
 *
 * Without `timeZone` these render in whoever is rendering — the server's zone for a server
 * component, the browser's for a client one — while the venue's opening hours, a proposal's
 * suggested slot and its "staff available 18:30-20:15" assumptions are all venue time. That
 * put two different times for the same event on one screen.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

type Style = 'dateTime' | 'day' | 'time';

const OPTIONS: Record<Style, Intl.DateTimeFormatOptions> = {
  dateTime: { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  day: { weekday: 'short', month: 'short', day: 'numeric' },
  time: { hour: 'numeric', minute: '2-digit' },
};

function formatter(style: Style, timezone: string): Intl.DateTimeFormat {
  const key = `${style}|${timezone}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const made = new Intl.DateTimeFormat(VENUE_LOCALE, { ...OPTIONS[style], timeZone: timezone });
  formatterCache.set(key, made);
  return made;
}

export const formatDateTime = (iso: string, timezone: string = VENUE_TIMEZONE): string =>
  formatter('dateTime', timezone).format(new Date(iso));

export const formatDay = (iso: string, timezone: string = VENUE_TIMEZONE): string =>
  formatter('day', timezone).format(new Date(iso));

export const formatTime = (iso: string, timezone: string = VENUE_TIMEZONE): string =>
  formatter('time', timezone).format(new Date(iso));

/** `null` means free or pay at the venue, which is not the same as $0.00. */
export const formatPrice = (cents: number | null): string =>
  cents === null ? 'Free / pay at venue' : `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;

export const formatPriceRange = (min: number | null, max: number | null): string => {
  if (min === null && max === null) return 'Not set';
  if (min !== null && max !== null) return `${formatPrice(min)}-${formatPrice(max)}`;
  return formatPrice(min ?? max);
};

/**
 * `datetime-local` values are rendered and read in the **venue's** zone, not the browser's.
 *
 * A venue's opening hours are a wall-clock fact about the venue, and the server validates
 * against them in `VENUE_TIMEZONE`. Using the browser's zone meant an owner on a laptop set
 * to anything else saw times shifted by hours and had plausible entries rejected — which is
 * exactly what a UTC CI runner hit.
 */
export const toDateTimeLocalValue = (iso: string, timezone: string = VENUE_TIMEZONE): string => {
  const wall = wallTimeInZone(timezone, new Date(iso));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
};

export const fromDateTimeLocalValue = (value: string, timezone: string = VENUE_TIMEZONE): string => {
  const [date, time] = value.split('T');
  const [year, month, day] = (date ?? '').split('-').map(Number);
  const [hour, minute] = (time ?? '').split(':').map(Number);
  if ([year, month, day, hour, minute].some((n) => !Number.isFinite(n))) {
    // An empty or half-typed field must not throw in the browser; the route's schema
    // rejects it with a VALIDATION message the form can show on the field.
    return '';
  }
  return zonedWallTimeToUtc(timezone, year!, month!, day!, hour!, minute!).toISOString();
};

/** How the venue's zone is named next to a time field, e.g. "PST". */
export const timezoneLabel = (timezone: string = VENUE_TIMEZONE, at: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'short' })
    .formatToParts(at);
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timezone;
};
