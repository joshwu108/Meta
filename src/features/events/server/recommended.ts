import "server-only";
import { createHash } from "node:crypto";
import type { SharablePreferences } from "@/shared/types";
import type { EventRow } from "../schemas";
import { loadCardContext, toEventCard, type EventCard } from "./cards";
import { venueOf } from "./mappers";
import { rankEvents, type CandidateEvent, type RankedEvent, type ScoreBreakdown } from "./recommend";
import { listLiveEventsBetween, viewerLocation } from "./repo";
import { createAdminClient, explainRecommendation, getSharablePreferences } from "./stubs";

const WINDOW_DAYS = 21;
const EXPLANATION_TTL_MS = 24 * 60 * 60 * 1000;
const FALLBACK_EXPLANATION = "Coming up soon near you.";

export type RecommendedEvent = {
  event: EventCard;
  score: number | null;
  breakdown: ScoreBreakdown | null;
  explanation: string;
};

const SLOT_LABELS: Record<string, string> = {
  mon_eve: "Monday evening", tue_eve: "Tuesday evening", wed_eve: "Wednesday evening", thu_eve: "Thursday evening",
  fri_eve: "Friday evening", sat_day: "Saturday daytime", sat_eve: "Saturday evening", sun_day: "Sunday daytime",
  sun_eve: "Sunday evening",
};

// Per-process cache keyed by (viewer, event, prefsHash); a preference change produces a new key.
const explanationCache = new Map<string, { text: string; expiresAt: number }>();

export function prefsHash(prefs: SharablePreferences): string {
  return createHash("sha256").update(JSON.stringify(prefs)).digest("hex").slice(0, 16);
}

async function explain(prefs: SharablePreferences, ranked: RankedEvent): Promise<string> {
  if (!ranked.breakdown) return FALLBACK_EXPLANATION;
  const key = `${prefs.userId}:${ranked.event.id}:${prefsHash(prefs)}`;
  const cached = explanationCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.text;
  const { event } = ranked;
  const text = await explainRecommendation({
    viewer: prefs,
    target: {
      kind: "event", title: event.title, category: event.category,
      slotLabel: ranked.slot ? SLOT_LABELS[ranked.slot] ?? null : null,
      capacity: event.capacity, priceCents: event.priceCents,
    },
    breakdown: ranked.breakdown,
  }).catch(() => FALLBACK_EXPLANATION);
  explanationCache.set(key, { text, expiresAt: Date.now() + EXPLANATION_TTL_MS });
  return text;
}

function toCandidate(row: EventRow, friends: number, cancelled: boolean): CandidateEvent {
  return {
    id: row.id, title: row.title, description: row.description, category: row.category, startsAt: row.starts_at,
    capacity: row.capacity, priceCents: row.price_cents, venue: venueOf(row), friendsGoing: friends, cancelledByViewer: cancelled,
  };
}

/** Personalized ranking with grounded explanations (spec §5); non-personalized without matching consent. */
export async function getRecommendedEvents(viewerId: string, limit: number): Promise<RecommendedEvent[]> {
  const admin = createAdminClient();
  const now = new Date();
  const [prefs, rows, here] = await Promise.all([
    getSharablePreferences(viewerId, "matching"),
    listLiveEventsBetween(admin, now, new Date(now.getTime() + WINDOW_DAYS * 86_400_000)),
    viewerLocation(admin, viewerId),
  ]);
  const ctx = await loadCardContext(admin, viewerId, rows);
  const candidates = rows.map((r) =>
    toCandidate(r, ctx.friendsByEvent.get(r.id)?.length ?? 0, ctx.mine.get(r.id)?.status === "cancelled"),
  );
  const fallback = here.lat !== null && here.lng !== null ? { lat: here.lat, lng: here.lng } : null;
  const ranked = rankEvents(prefs, candidates, fallback).slice(0, limit);
  const byId = new Map(rows.map((r) => [r.id, r]));

  return Promise.all(
    ranked.map(async (r) => ({
      event: toEventCard(byId.get(r.event.id)!, ctx),
      score: r.score,
      breakdown: r.breakdown,
      explanation: prefs ? await explain(prefs, r) : FALLBACK_EXPLANATION,
    })),
  );
}
