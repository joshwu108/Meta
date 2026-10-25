import "server-only";
import { log } from "@/lib/log";
import { suggestEvents as events } from "./events";
import { suggestGroups as groups } from "./groups";
import { suggestPeople as people } from "./people";

/**
 * The agent's suggestion sources (spec 02 §5 capabilities), behind one entry point:
 * - people: 01's public cards through 02's own `matching` consent boundary
 * - groups: 03's public groups, minus the viewer's own
 * - events: 06's ranked recommendations
 * A source that fails returns no cards instead of failing the whole chat turn.
 */
function orNothing<A extends unknown[], T>(source: string, fn: (...args: A) => Promise<T[]>) {
  return async (...args: A): Promise<T[]> => {
    try {
      return await fn(...args);
    } catch (error) {
      log.warn("agent.suggestions_failed", { source, error });
      return [];
    }
  };
}

export const suggestPeople = orNothing("people", people);
export const suggestGroups = orNothing("groups", groups);
export const suggestEvents = orNothing("events", events);
export type { EventCandidate, GroupCandidate, PersonCandidate } from "./types";
