/** Date, time and money formatting for the business screens. Shared by server and client. */

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

/** `18:30` for a datetime-local input, in the viewer's own zone. */
export const toDateTimeLocalValue = (iso: string): string => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

export const fromDateTimeLocalValue = (value: string): string => new Date(value).toISOString();
