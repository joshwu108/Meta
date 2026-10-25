import "server-only";
import { log } from "@/lib/log";
import type { SharablePreferences } from "@/shared/types";
import type { RecommendedEvent } from "@/features/events";
import type { PublicGroupCard } from "@/features/groups";

/**
 * Candidates behind the agent's `suggest_*` capabilities. Every one is live data:
 * - people come from 01's `profile_public_cards` through ws02's consent boundary (./people.ts)
 * - events come from 06's `getRecommendedEvents` (ranked, with its own grounded explanation)
 * - groups come from 03's `getPublicGroups` (public, non-archived), re-ranked for this viewer
 *
 * The `*From` functions take their data source as a dependency so they are unit-testable without
 * a database; the bare `suggestEvents` / `suggestGroups` are the production wiring.
 */

export type PersonCandidate = {
  id: string;
  displayName: string;
  neighborhood: string;
  preferences: SharablePreferences;
};

export type EventCandidate = {
  id: string;
  title: string;
  startsAt: string;
  venue: string;
  category: string;
  description: string;
  /** 06's grounded explanation, reused so the agent need not pay for a second model call. */
  explanation?: string;
};

export type GroupCandidate = {
  id: string;
  name: string;
  description: string;
  interests: string[];
  memberCount: number;
};

export type EventSuggestionDeps = {
  recommendedEvents: (viewerId: string, limit: number) => Promise<readonly RecommendedEvent[]>;
};

export type GroupSuggestionDeps = {
  publicGroups: (limit: number) => Promise<readonly PublicGroupCard[]>;
};

/** Public groups are re-ranked for the viewer, so pull a pool wider than the card count. */
const GROUP_POOL = 24;

const overlap = (a: readonly string[], b: readonly string[]): number => a.filter((x) => b.includes(x)).length;

/** Flatten 06's ranked event onto the agent's card shape. */
export function toEventCandidate(rec: RecommendedEvent): EventCandidate {
  return {
    id: rec.event.id,
    title: rec.event.title,
    startsAt: rec.event.startsAt,
    venue: rec.event.business.name,
    category: rec.event.category,
    description: rec.event.description,
    explanation: rec.explanation,
  };
}

export async function suggestEventsFrom(
  deps: EventSuggestionDeps,
  viewerId: string,
  limit = 3,
): Promise<EventCandidate[]> {
  const ranked = await deps.recommendedEvents(viewerId, limit);
  return ranked.slice(0, limit).map(toEventCandidate);
}

/** Shared interests first, then the bigger group, then name so the order is stable. */
export async function suggestGroupsFrom(
  deps: GroupSuggestionDeps,
  viewer: Pick<SharablePreferences, "interests">,
  limit = 3,
): Promise<GroupCandidate[]> {
  const groups = await deps.publicGroups(GROUP_POOL);
  return groups
    .map((g) => ({ g, shared: overlap(viewer.interests, g.interests) }))
    .sort((a, b) => b.shared - a.shared || b.g.memberCount - a.g.memberCount || a.g.name.localeCompare(b.g.name))
    .slice(0, Math.max(0, limit))
    .map(({ g }) => ({
      id: g.id,
      name: g.name,
      description: g.description ?? "",
      interests: g.interests,
      memberCount: g.memberCount,
    }));
}

/**
 * A suggestion source that is down must not take the whole chat turn with it: the agent still
 * replies, just without those cards. The failure is logged, never swallowed quietly.
 */
async function softly<T>(what: string, run: () => Promise<T[]>): Promise<T[]> {
  try {
    return await run();
  } catch (error) {
    log.warn("agent.suggestions.unavailable", { source: what, error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

/** Production wiring. Lazy imports keep other features out of this module's load graph. */
export async function suggestEvents(viewerId: string, limit = 3): Promise<EventCandidate[]> {
  return softly("events", async () => {
    const { getRecommendedEvents } = await import("@/features/events");
    return suggestEventsFrom({ recommendedEvents: getRecommendedEvents }, viewerId, limit);
  });
}

export async function suggestGroups(
  viewer: Pick<SharablePreferences, "interests">,
  limit = 3,
): Promise<GroupCandidate[]> {
  return softly("groups", async () => {
    const { getPublicGroups } = await import("@/features/groups");
    return suggestGroupsFrom({ publicGroups: getPublicGroups }, viewer, limit);
  });
}
