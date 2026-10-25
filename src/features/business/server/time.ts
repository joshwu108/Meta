import 'server-only';

/**
 * Server-side view of the venue wall-clock helpers. The implementation is shared with the
 * client in `../venue-time`, because the event editor has to render and read
 * `datetime-local` in the venue's zone rather than the owner's browser zone.
 */
export {
  VENUE_TIMEZONE,
  minutesSinceMidnight,
  nextSlotOccurrence,
  parseTimeOfDay,
  slotWeekday,
  wallTimeInZone,
  weekdayKeyOf,
  zonedWallTimeToUtc,
  type SlotOptions,
  type WallTime,
} from '../venue-time';
