import "server-only";
import type { EventCategory } from "@/shared/enums";
import type { SharablePreferences } from "@/shared/types";
import type { ScoreBreakdown } from "../recommend";
import { createAdminClient } from "./core";

// Stand-ins for 02's exports (specs/02-onboarding-and-agent/specs.md §5). Only these stubs read
// 02's tables; replace each with the real export from "@/features/agent" when it lands.

type Purpose = "matching" | "demand" | "group_plan";
const CONSENT_FLAG: Record<Purpose, string> = {
  matching: "allow_matching",
  demand: "allow_demand_aggregation",
  group_plan: "allow_group_planning",
};

type Consent = Record<string, boolean | undefined>;

export async function getSharablePreferences(
  userId: string,
  purpose: Purpose,
): Promise<(SharablePreferences & { interestCategories: EventCategory[] }) | null> {
  const db = createAdminClient();
  const [{ data: prefs }, { data: agent }, { data: profile }] = await Promise.all([
    db.from("user_preferences").select("*").eq("user_id", userId).maybeSingle(),
    db.from("agent_profiles").select("consent").eq("user_id", userId).maybeSingle(),
    db.from("profiles").select("is_discoverable, coarse_lat, coarse_lng, neighborhood").eq("id", userId).maybeSingle(),
  ]);
  const consent = (agent?.consent ?? {}) as Consent;
  if (!prefs || !profile || consent[CONSENT_FLAG[purpose]] !== true) return null;
  if (purpose === "matching" && !profile.is_discoverable) return null;
  return {
    userId,
    interests: prefs.interests ?? [],
    interestCategories: prefs.interest_categories ?? [],
    availabilitySlots: prefs.availability_slots ?? [],
    socialGoals: prefs.social_goals ?? [],
    groupSizePref: prefs.group_size_pref ?? "small",
    budgetMin: prefs.budget_min_cents ?? null,
    budgetMax: prefs.budget_max_cents ?? null,
    travelRadiusKm: Number(prefs.travel_radius_km ?? 5),
    activityPrefs: prefs.activity_prefs ?? [],
    coarseLat: profile.coarse_lat === null ? null : Number(profile.coarse_lat),
    coarseLng: profile.coarse_lng === null ? null : Number(profile.coarse_lng),
    neighborhood: profile.neighborhood ?? null,
  };
}

export type ExplainEventInput = {
  viewer: SharablePreferences;
  target: { kind: "event"; title: string; category: EventCategory; slotLabel: string | null; capacity: number; priceCents: number | null };
  breakdown: ScoreBreakdown;
};

/** Templated "why" built only from the input, standing in for 02's `agent.explain_recommendation`. */
export async function explainRecommendation(input: ExplainEventInput): Promise<string> {
  const { target, breakdown } = input;
  const parts = [
    breakdown.interest > 0 ? `${target.title} fits your interests` : target.title,
    breakdown.slot > 0 && target.slotLabel ? `on a ${target.slotLabel}` : null,
  ].filter(Boolean);
  const extras = [
    breakdown.social >= 7 ? `${target.capacity <= 6 ? "small" : "right-sized"} group` : null,
    breakdown.budget === 15 ? (target.priceCents ? "within your budget" : "free") : null,
    breakdown.proximity >= 7 ? "close to you" : null,
  ].filter(Boolean);
  return [parts.join(" "), ...extras].join(", ") + ".";
}

export type AttendeeSharing = { interests: string[]; shareInterestsWithAttendees: boolean };

/** Consent + interests needed for shared-interest chips on the attendee list. */
export async function getAttendeeSharing(userIds: readonly string[]): Promise<Map<string, AttendeeSharing>> {
  if (userIds.length === 0) return new Map();
  const db = createAdminClient();
  const [{ data: agents }, { data: prefs }] = await Promise.all([
    db.from("agent_profiles").select("user_id, consent").in("user_id", userIds),
    db.from("user_preferences").select("user_id, interests").in("user_id", userIds),
  ]);
  const interestsBy = new Map((prefs ?? []).map((p) => [p.user_id as string, (p.interests ?? []) as string[]]));
  return new Map(
    (agents ?? []).map((a) => {
      const share = (a.consent as Consent)?.share_interests_with_attendees === true;
      return [a.user_id as string, { interests: share ? interestsBy.get(a.user_id) ?? [] : [], shareInterestsWithAttendees: share }];
    }),
  );
}

/** Defaults for the RSVP consent sheet, prefilled from the user's agent permissions. */
export async function getRsvpConsentDefaults(userId: string): Promise<{ shareWithAttendees: boolean; shareWithBusiness: boolean }> {
  const { data } = await createAdminClient().from("agent_profiles").select("consent").eq("user_id", userId).maybeSingle();
  const consent = (data?.consent ?? {}) as Consent;
  return {
    shareWithAttendees: consent.share_interests_with_attendees === true,
    shareWithBusiness: consent.share_name_with_business === true,
  };
}
