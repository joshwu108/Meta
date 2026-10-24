import { describe, expect, it } from 'vitest';
import {
  VENUE_TIMEZONE,
  nextSlotOccurrence,
  slotWeekday,
  weekdayKeyOf,
  wallTimeInZone,
  zonedWallTimeToUtc,
} from '@/features/business/server/time';

describe('slot to weekday', () => {
  it('maps every availability slot to its weekday key', () => {
    expect(slotWeekday('mon_eve')).toBe('mon');
    expect(slotWeekday('thu_eve')).toBe('thu');
    expect(slotWeekday('sat_day')).toBe('sat');
    expect(slotWeekday('sat_eve')).toBe('sat');
    expect(slotWeekday('sun_day')).toBe('sun');
    expect(slotWeekday('sun_eve')).toBe('sun');
  });
});

describe('zoned wall time', () => {
  it('reads a wall clock time back out of an instant', () => {
    // 2026-10-29 18:30 in Los Angeles is 01:30 UTC the next day (PDT, UTC-7).
    const utc = zonedWallTimeToUtc('America/Los_Angeles', 2026, 10, 29, 18, 30);
    expect(utc.toISOString()).toBe('2026-10-30T01:30:00.000Z');
    expect(wallTimeInZone('America/Los_Angeles', utc)).toEqual({
      year: 2026,
      month: 10,
      day: 29,
      hour: 18,
      minute: 30,
      weekday: 'thu',
    });
  });

  it('handles the standard-time side of the DST boundary', () => {
    // After 2026-11-01 the offset is UTC-8 (PST).
    const utc = zonedWallTimeToUtc('America/Los_Angeles', 2026, 11, 5, 18, 30);
    expect(utc.toISOString()).toBe('2026-11-06T02:30:00.000Z');
  });

  it('round-trips a UTC venue timezone', () => {
    const utc = zonedWallTimeToUtc('UTC', 2026, 10, 29, 18, 30);
    expect(utc.toISOString()).toBe('2026-10-29T18:30:00.000Z');
  });

  it('defaults the venue timezone to the demo city', () => {
    expect(VENUE_TIMEZONE).toBe('America/Los_Angeles');
  });

  it('derives the weekday key of an instant', () => {
    expect(weekdayKeyOf('UTC', new Date('2026-10-29T12:00:00Z'))).toBe('thu');
    expect(weekdayKeyOf('UTC', new Date('2026-11-01T12:00:00Z'))).toBe('sun');
  });
});

describe('next slot occurrence', () => {
  const from = new Date('2026-10-26T12:00:00Z'); // Monday 05:00 in Los Angeles

  it('finds the coming Thursday evening', () => {
    const at = nextSlotOccurrence('thu_eve', '18:30', { from, timezone: 'America/Los_Angeles' });
    expect(at.toISOString()).toBe('2026-10-30T01:30:00.000Z');
    expect(weekdayKeyOf('America/Los_Angeles', at)).toBe('thu');
  });

  it('returns today when the slot time is still ahead', () => {
    const at = nextSlotOccurrence('mon_eve', '18:30', { from, timezone: 'America/Los_Angeles' });
    expect(at.toISOString()).toBe('2026-10-27T01:30:00.000Z');
  });

  it('skips to next week when today is the slot day but the time has passed', () => {
    const lateMonday = new Date('2026-10-27T04:00:00Z'); // Monday 21:00 in Los Angeles
    const at = nextSlotOccurrence('mon_eve', '18:30', {
      from: lateMonday,
      timezone: 'America/Los_Angeles',
    });
    expect(at.toISOString()).toBe('2026-11-03T02:30:00.000Z');
  });

  it('is always strictly in the future', () => {
    for (const slot of ['mon_eve', 'thu_eve', 'sat_day', 'sun_eve'] as const) {
      const at = nextSlotOccurrence(slot, '10:00', { from, timezone: 'America/Los_Angeles' });
      expect(at.getTime()).toBeGreaterThan(from.getTime());
      expect(at.getTime() - from.getTime()).toBeLessThanOrEqual(8 * 24 * 60 * 60 * 1000);
    }
  });
});
