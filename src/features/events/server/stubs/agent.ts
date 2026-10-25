import "server-only";
import type { AvailabilitySlot, EventCategory } from "@/shared/enums";
import type { SharablePreferences } from "@/shared/types";
import { logAgentAction } from "./core";

// Stand-ins for 02's exports (specs/02-onboarding-and-agent/specs.md §5). Only these stubs read
// 02's tables; replace each with the real export from "@/features/agent" when it lands.

/** 02 is on main: preferences come through its consent boundary. */
export { getSharablePreferences } from "@/features/agent";

/** 02's ExplainInput (src/features/agent/server/explain.ts on ws/02-agent). */
export type ExplainInput = {
  viewer: SharablePreferences;
  target:
    | { kind: "person"; preferences: SharablePreferences; displayName?: string }
    | { kind: "event"; event: Record<string, unknown> }
    | { kind: "group"; group: Record<string, unknown> };
  breakdown: Record<string, unknown>;
};

/** Templated "why" built only from the input, standing in for 02's `agent.explain_recommendation`. */
export async function explainRecommendation(input: ExplainInput): Promise<string> {
  if (input.target.kind !== "event") return "Matches your preferences and availability.";
  const event = input.target.event as { title?: string; slot?: string | null; capacity?: number; priceCents?: number | null };
  const b = input.breakdown as Partial<Record<"interest" | "slot" | "budget" | "proximity" | "social", number>>;
  const title = event.title ?? "This event";
  const parts = [
    (b.interest ?? 0) > 0 ? `${title} fits your interests` : title,
    (b.slot ?? 0) > 0 && event.slot ? `on a ${event.slot}` : null,
  ].filter(Boolean);
  const extras = [
    (b.social ?? 0) >= 7 ? `${(event.capacity ?? 0) <= 6 ? "small" : "right-sized"} group` : null,
    b.budget === 15 ? (event.priceCents ? "within your budget" : "free") : null,
    (b.proximity ?? 0) >= 7 ? "close to you" : null,
  ].filter(Boolean);
  return [parts.join(" "), ...extras].join(", ") + ".";
}

export type AttendeeSharing = { interests: string[]; shareInterestsWithAttendees: boolean };

/**
 * 02's getAttendeeSharing (ws/02-agent, same signature). Only 02 may read its tables, so until
 * it merges nobody's interests are shared.
 */
export async function getAttendeeSharing(_userIds: readonly string[]): Promise<Map<string, AttendeeSharing>> {
  return new Map();
}

/** 02's Consent flags. */
export type Consent = {
  allow_matching: boolean;
  allow_demand_aggregation: boolean;
  allow_group_planning: boolean;
  share_interests_with_attendees: boolean;
  share_name_with_business: boolean;
};

/** 02's getConsent (ws/02-agent, same signature). Until it merges every flag is off, so nothing is shared by default. */
export async function getConsent(_userId: string): Promise<Consent> {
  return {
    allow_matching: false,
    allow_demand_aggregation: false,
    allow_group_planning: false,
    share_interests_with_attendees: false,
    share_name_with_business: false,
  };
}

const SLOT_PHRASE: Record<string, string> = {
  sat_day: "Saturday morning", sun_day: "Sunday morning", sat_eve: "Saturday evening", sun_eve: "Sunday evening",
  mon_eve: "Monday evening", tue_eve: "Tuesday evening", wed_eve: "Wednesday evening", thu_eve: "Thursday evening",
  fri_eve: "Friday evening",
};

/**
 * Stand-in for 02's suggestFollowUp (same signature): both people's consented preferences are
 * required, and like 02's version it writes one agent-log row per person.
 */
export async function suggestFollowUp(input: {
  a: SharablePreferences;
  b: SharablePreferences;
  event: { title: string; category: EventCategory; startsAt: string };
}): Promise<{ title: string; description: string; suggestedSlot: AvailabilitySlot; suggestedBusinessCategory: EventCategory }> {
  const theirs = new Set(input.b.availabilitySlots);
  const shared = input.a.availabilitySlots.filter((s) => theirs.has(s));
  const suggestedSlot: AvailabilitySlot = shared.find((s) => s.endsWith("_day")) ?? shared[0] ?? "sat_day";
  const suggestion = {
    title: `Coffee, ${SLOT_PHRASE[suggestedSlot]}`,
    description: `You both enjoyed ${input.event.title}. Pick up the conversation over coffee.`,
    suggestedSlot,
    suggestedBusinessCategory: "food_drink" as const,
  };
  await Promise.all([input.a.userId, input.b.userId].map((userId) => logAgentAction({
    userId, actor: "personal_agent", action: "follow_up_suggestion", permissionsUsed: ["reconnect"],
    result: `Suggested a follow-up: ${suggestion.title}`,
  })));
  return suggestion;
}
