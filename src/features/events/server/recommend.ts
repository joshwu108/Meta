import "server-only";
import type { AvailabilitySlot, EventCategory, GroupSizePref } from "@/shared/enums";
import type { SharablePreferences } from "@/shared/types";
import { categoriesForInterests } from "./categories";
import { haversineKm, type LatLng } from "./geo";
import { deriveSlot } from "./slots";

/** Weights from spec §5; they sum to 100 and are the only place to tune ranking. */
export const WEIGHTS = { interest: 40, slot: 25, budget: 15, proximity: 10, social: 10 } as const;
const TAG_BONUS = 0.5;
const SIZE_MATCH = 0.7;
const SIZE_ADJACENT = 0.35;
const FRIENDS_BONUS = 0.3;
const UNKNOWN = 0.5;

const SIZE_ORDER: readonly GroupSizePref[] = ["one_on_one", "small", "medium", "large"];

/** 02 may extend SharablePreferences with categories; older payloads fall back to tag mapping. */
export type ViewerPreferences = SharablePreferences & { interestCategories?: EventCategory[] };

export type CandidateEvent = {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  startsAt: string;
  capacity: number;
  priceCents: number | null;
  venue: LatLng;
  /** Accepted connections with a consented, confirmed RSVP; blocked users already excluded. */
  friendsGoing: number;
  cancelledByViewer: boolean;
};

export type ScoreBreakdown = { interest: number; slot: number; budget: number; proximity: number; social: number };

export type RankedEvent = {
  event: CandidateEvent;
  score: number | null;
  breakdown: ScoreBreakdown | null;
  slot: AvailabilitySlot | null;
  distanceKm: number | null;
  deprioritized: boolean;
};

export function capacityBucket(capacity: number): GroupSizePref {
  if (capacity <= 2) return "one_on_one";
  if (capacity <= 6) return "small";
  if (capacity <= 12) return "medium";
  return "large";
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function viewerLocation(prefs: Pick<SharablePreferences, "coarseLat" | "coarseLng">): LatLng | null {
  return prefs.coarseLat === null || prefs.coarseLng === null ? null : { lat: prefs.coarseLat, lng: prefs.coarseLng };
}

function mentionsAny(text: string, tags: readonly string[]): boolean {
  const haystack = text.toLowerCase();
  return tags.some((tag) => {
    const phrase = tag.toLowerCase().replaceAll("-", " ").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return phrase.length > 0 && new RegExp(`\\b${phrase}\\b`).test(haystack);
  });
}

function interestFit(prefs: ViewerPreferences, event: CandidateEvent): number {
  const categories = prefs.interestCategories ?? categoriesForInterests(prefs.interests);
  const categoryMatch = categories.includes(event.category) ? 1 : 0;
  const tagMatch = mentionsAny(`${event.title} ${event.description}`, prefs.interests) ? TAG_BONUS : 0;
  return (categoryMatch + tagMatch) / (1 + TAG_BONUS);
}

function budgetFit(prefs: ViewerPreferences, event: CandidateEvent): number {
  if (event.priceCents === null || event.priceCents === 0) return 1;
  if (prefs.budgetMax === null) return UNKNOWN;
  return event.priceCents <= prefs.budgetMax ? 1 : 0;
}

function proximityFit(prefs: ViewerPreferences, distanceKm: number | null): number {
  if (distanceKm === null) return UNKNOWN;
  return Math.max(0, 1 - distanceKm / prefs.travelRadiusKm);
}

function socialFit(prefs: ViewerPreferences, event: CandidateEvent): number {
  const gap = Math.abs(SIZE_ORDER.indexOf(capacityBucket(event.capacity)) - SIZE_ORDER.indexOf(prefs.groupSizePref));
  const sizeFit = gap === 0 ? SIZE_MATCH : gap === 1 ? SIZE_ADJACENT : 0;
  return Math.min(1, sizeFit + (event.friendsGoing > 0 ? FRIENDS_BONUS : 0));
}

/** Deterministic 0–100 score with a per-factor breakdown in points (spec §5). */
export function scoreEvent(prefs: ViewerPreferences, event: CandidateEvent): { score: number; breakdown: ScoreBreakdown } {
  const here = viewerLocation(prefs);
  const distanceKm = here ? haversineKm(here, event.venue) : null;
  const slot = deriveSlot(event.startsAt);
  const breakdown: ScoreBreakdown = {
    interest: round1(WEIGHTS.interest * interestFit(prefs, event)),
    slot: slot !== null && prefs.availabilitySlots.includes(slot) ? WEIGHTS.slot : 0,
    budget: round1(WEIGHTS.budget * budgetFit(prefs, event)),
    proximity: round1(WEIGHTS.proximity * proximityFit(prefs, distanceKm)),
    social: round1(WEIGHTS.social * socialFit(prefs, event)),
  };
  const total = breakdown.interest + breakdown.slot + breakdown.budget + breakdown.proximity + breakdown.social;
  return { score: Math.round(total), breakdown };
}

function byStartThenId(a: RankedEvent, b: RankedEvent): number {
  return a.event.startsAt.localeCompare(b.event.startsAt) || a.event.id.localeCompare(b.event.id);
}

function rankPersonalized(prefs: ViewerPreferences, events: readonly CandidateEvent[]): RankedEvent[] {
  const here = viewerLocation(prefs);
  return events
    .map((event): RankedEvent => {
      const { score, breakdown } = scoreEvent(prefs, event);
      const distanceKm = here ? haversineKm(here, event.venue) : null;
      return { event, score, breakdown, slot: deriveSlot(event.startsAt), distanceKm, deprioritized: event.cancelledByViewer };
    })
    .filter((r) => r.distanceKm === null || r.distanceKm <= prefs.travelRadiusKm)
    .sort(
      (a, b) =>
        Number(a.deprioritized) - Number(b.deprioritized) || (b.score ?? 0) - (a.score ?? 0) || byStartThenId(a, b),
    );
}

function rankByDistanceAndDate(events: readonly CandidateEvent[], here: LatLng | null): RankedEvent[] {
  return events
    .map((event): RankedEvent => ({
      event,
      score: null,
      breakdown: null,
      slot: deriveSlot(event.startsAt),
      distanceKm: here ? haversineKm(here, event.venue) : null,
      deprioritized: event.cancelledByViewer,
    }))
    .sort(
      (a, b) =>
        Number(a.deprioritized) - Number(b.deprioritized) ||
        (a.distanceKm ?? 0) - (b.distanceKm ?? 0) ||
        byStartThenId(a, b),
    );
}

/**
 * Ranks candidate events for a viewer. With null preferences (no matching consent) the
 * order is non-personalized: nearest first, then soonest.
 */
export function rankEvents(
  prefs: ViewerPreferences | null,
  events: readonly CandidateEvent[],
  fallbackLocation: LatLng | null = null,
): RankedEvent[] {
  return prefs ? rankPersonalized(prefs, events) : rankByDistanceAndDate(events, fallbackLocation);
}
