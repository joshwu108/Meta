import { afterEach, describe, expect, it } from 'vitest';
import {
  fromDateTimeLocalValue,
  timezoneLabel,
  toDateTimeLocalValue,
} from '@/features/business/format';

/**
 * A venue's opening hours are a wall-clock fact about the venue, and the server checks an
 * event against them in `VENUE_TIMEZONE`. The editor therefore has to render and read its
 * `datetime-local` fields in that zone too — using the browser's meant an owner whose
 * laptop was set to anything else saw times shifted by hours and had plausible entries
 * rejected, which is what a UTC CI runner hit.
 */
describe('datetime-local values are the venue wall clock', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('renders an instant as the venue reads it, whatever the viewer zone', () => {
    // 2026-10-30T01:30Z is Thursday 18:30 in Los Angeles (PDT).
    expect(toDateTimeLocalValue('2026-10-30T01:30:00.000Z', 'America/Los_Angeles')).toBe(
      '2026-10-29T18:30',
    );
    expect(toDateTimeLocalValue('2026-10-30T01:30:00.000Z', 'UTC')).toBe('2026-10-30T01:30');
  });

  it('reads a form value as the venue wall clock, not the browser one', () => {
    expect(fromDateTimeLocalValue('2026-10-29T18:30', 'America/Los_Angeles')).toBe(
      '2026-10-30T01:30:00.000Z',
    );
    expect(fromDateTimeLocalValue('2026-10-29T18:30', 'UTC')).toBe('2026-10-29T18:30:00.000Z');
  });

  it('round-trips an instant through the form without drift', () => {
    for (const iso of [
      '2026-10-30T01:30:00.000Z',
      '2026-11-06T02:30:00.000Z', // the standard-time side of the DST change
      '2026-07-04T19:00:00.000Z',
    ]) {
      const value = toDateTimeLocalValue(iso, 'America/Los_Angeles');
      expect(fromDateTimeLocalValue(value, 'America/Los_Angeles')).toBe(iso);
    }
  });

  it('crosses the DST boundary without shifting the wall clock', () => {
    // Both are 18:30 at the venue, one in PDT and one in PST.
    expect(fromDateTimeLocalValue('2026-10-29T18:30', 'America/Los_Angeles')).toBe(
      '2026-10-30T01:30:00.000Z',
    );
    expect(fromDateTimeLocalValue('2026-11-05T18:30', 'America/Los_Angeles')).toBe(
      '2026-11-06T02:30:00.000Z',
    );
  });

  it('falls back rather than throwing on an unparsable value', () => {
    expect(() => fromDateTimeLocalValue('', 'America/Los_Angeles')).not.toThrow();
  });

  it('names the zone for the owner', () => {
    expect(timezoneLabel('America/Los_Angeles', new Date('2026-10-29T18:30:00Z'))).toMatch(/P[DS]T/);
    expect(timezoneLabel('UTC', new Date('2026-10-29T18:30:00Z'))).toBe('UTC');
  });
});
