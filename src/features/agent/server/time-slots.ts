import { AVAILABILITY_SLOT, type AvailabilitySlot } from "@/shared/enums";

type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const DAY_PATTERNS: ReadonlyArray<readonly [Day, RegExp]> = [
  ["mon", /\bmon(day)?s?\b/],
  ["tue", /\btue(s|sday)?s?\b/],
  ["wed", /\bwed(nesday)?s?\b/],
  ["thu", /\bthu(r|rs|rsday)?s?\b/],
  ["fri", /\bfri(day)?s?\b/],
  ["sat", /\bsat(urday)?s?\b/],
  ["sun", /\bsun(day)?s?\b/],
];

const DAYTIME = /\b(morning|mornings|afternoon|afternoons|daytime|brunch|day)\b/;
const EVENING = /\b(evening|evenings|night|nights|after work|tonight)\b/;
const WEEKDAYS: readonly Day[] = ["mon", "tue", "wed", "thu", "fri"];

function slotsForDay(day: Day, daytime: boolean, evening: boolean): AvailabilitySlot[] {
  if (day === "sat" || day === "sun") {
    if (daytime && !evening) return [`${day}_day`];
    if (evening && !daytime) return [`${day}_eve`];
    return [`${day}_day`, `${day}_eve`];
  }
  // Weekdays only have an evening slot; daytime-only weekday phrases map to nothing.
  return daytime && !evening ? [] : [`${day}_eve`];
}

function daysIn(text: string): Day[] {
  if (/\bweeknights?\b|\bweekday evenings?\b/.test(text)) return [...WEEKDAYS];
  const days = DAY_PATTERNS.filter(([, re]) => re.test(text)).map(([d]) => d);
  return /\bweekends?\b/.test(text) ? [...days, "sat", "sun"] : days;
}

/**
 * Map a colloquial time phrase to AVAILABILITY_SLOT values, e.g.
 * "Thursday evenings" → ["thu_eve"], "weekends" → all four weekend slots.
 * Returns [] when no day is mentioned; never guesses.
 */
export function phraseToSlots(phrase: string): AvailabilitySlot[] {
  const text = phrase.toLowerCase();
  const daytime = DAYTIME.test(text);
  const evening = EVENING.test(text);
  const found = new Set(daysIn(text).flatMap((d) => slotsForDay(d, daytime, evening)));
  return AVAILABILITY_SLOT.filter((s) => found.has(s));
}
