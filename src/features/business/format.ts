/** Date, time and money formatting for the business screens. Shared by server and client. */
import { VENUE_TIMEZONE, wallTimeInZone, zonedWallTimeToUtc } from './venue-time';

export const VENUE_LOCALE = 'en-US';

const dateTime = new Intl.DateTimeFormat(VENUE_LOCALE, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const dayOnly = new Intl.DateTimeFormat(VENUE_LOCALE, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const timeOnly = new Intl.DateTimeFormat(VENUE_LOCALE, { hour: 'numeric', minute: '2-digit' });

export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso));
export const formatDay = (iso: string): string => dayOnly.format(new Date(iso));
export const formatTime = (iso: string): string => timeOnly.format(new Date(iso));

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
