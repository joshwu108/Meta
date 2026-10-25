import { describe, expect, it } from 'vitest';
import { addDays, dateInZone, isOpen, seedEventTimes, weekdayOf, zonedToUtc } from '../../../supabase/seed/venue-time';

const LA = 'America/Los_Angeles';
const KILN = { tue: [['10:00', '20:00']], wed: [['10:00', '20:00']], thu: [['09:00', '21:00']], fri: [['09:00', '21:00']], sat: [['10:00', '18:00']] } as const;

describe('seed venue time', () => {
  it('resolves wall time in the venue zone, including across DST', () => {
    // 2026-07-15 is PDT (UTC-7), 2026-12-15 is PST (UTC-8).
    expect(zonedToUtc(LA, { year: 2026, month: 7, day: 15 }, 18).toISOString()).toBe('2026-07-16T01:00:00.000Z');
    expect(zonedToUtc(LA, { year: 2026, month: 12, day: 15 }, 18).toISOString()).toBe('2026-12-16T02:00:00.000Z');
  });

  it('reads the venue calendar date, not the machine date', () => {
    // 05:00 UTC on Oct 25 is still Oct 24 in Los Angeles.
    expect(dateInZone(LA, new Date('2026-10-25T05:00:00Z'))).toEqual({ year: 2026, month: 10, day: 24 });
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(weekdayOf({ year: 2026, month: 10, day: 26 })).toBe('mon');
  });

  it('isOpen needs one interval to cover the whole event; no hours means open', () => {
    expect(isOpen(KILN, 'thu', 18, 2)).toBe(true);
    expect(isOpen(KILN, 'tue', 19, 2)).toBe(false);
    expect(isOpen(KILN, 'mon', 12, 1)).toBe(false);
    expect(isOpen(undefined, 'mon', 12, 1)).toBe(true);
  });

  it('places an event at the venue hour and skips days the venue is closed', () => {
    const now = new Date('2026-10-24T20:00:00Z'); // Saturday Oct 24 in LA
    // +2 days = Monday, closed at Kiln & Cup → Tuesday 18:00 PDT.
    const times = seedEventTimes({ daysFromNow: 2, startHour: 18, durationHours: 2, hours: KILN }, now, LA);
    expect(times).toEqual({ startsAt: '2026-10-28T01:00:00.000Z', endsAt: '2026-10-28T03:00:00.000Z' });
    // Without hours the date is kept: Monday 18:00 PDT.
    expect(seedEventTimes({ daysFromNow: 2, startHour: 18, durationHours: 2 }, now, LA).startsAt).toBe('2026-10-27T01:00:00.000Z');
  });

  it('gives the same result regardless of the machine timezone', () => {
    const now = new Date('2026-10-24T20:00:00Z');
    const original = process.env.TZ;
    const results = ['UTC', 'Asia/Tokyo', 'America/Chicago'].map((tz) => {
      process.env.TZ = tz;
      return seedEventTimes({ daysFromNow: 3, startHour: 11, durationHours: 1 }, now, LA).startsAt;
    });
    process.env.TZ = original;
    expect(new Set(results).size).toBe(1);
  });
});
