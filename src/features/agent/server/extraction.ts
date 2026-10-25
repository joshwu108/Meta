import { AVAILABILITY_SLOT, type AvailabilitySlot } from "@/shared/enums";
import {
  TagSchema,
  type ExtractedPreferences,
  type FieldSources,
  type PreferenceField,
  type UserPreferences,
  type UserPreferencesWithSources,
} from "../schemas";
import { phraseToSlots } from "./time-slots";

/** At most 3 follow-up questions, and never past the 4th user turn. */
export const MAX_FOLLOW_UPS = 3;
export const MAX_ONBOARDING_TURNS = 4;
const MIN_INTEREST_CONFIDENCE = 0.5;

const DAY_WORDS: Record<string, RegExp> = {
  mon: /\bmon(day)?s?\b|\bweeknights?\b|\bweekdays?\b/,
  tue: /\btue(s|sday)?s?\b|\bweeknights?\b|\bweekdays?\b/,
  wed: /\bwed(nesday)?s?\b|\bweeknights?\b|\bweekdays?\b/,
  thu: /\bthu(r|rs|rsday)?s?\b|\bweeknights?\b|\bweekdays?\b/,
  fri: /\bfri(day)?s?\b|\bweeknights?\b|\bweekdays?\b/,
  sat: /\bsat(urday)?s?\b|\bweekends?\b/,
  sun: /\bsun(day)?s?\b|\bweekends?\b/,
};

const BUDGET_WORDS = /\$|\b\d+\s*(dollars|bucks|usd)\b|\bbudget\b|\bcheap\b|\bfree (events?|stuff|things)\b|\bafford|\bspend\b|\bunder \d+/;

/**
 * Ground the model's output in what the user actually typed: drop availability
 * slots whose day never appears, drop a budget nobody mentioned, add slots the
 * deterministic phrase mapper finds, and drop low-confidence interests.
 */
export function groundExtraction(extracted: ExtractedPreferences, userText: string): ExtractedPreferences {
  const text = userText.toLowerCase();
  const mentioned = extracted.availabilitySlots.filter((slot) => DAY_WORDS[slot.slice(0, 3)]?.test(text));
  const mapped = phraseToSlots(text);
  const slots = new Set<AvailabilitySlot>([...mentioned, ...mapped]);
  return {
    ...extracted,
    interests: extracted.interests.filter((i) => i.confidence >= MIN_INTEREST_CONFIDENCE),
    availabilitySlots: AVAILABILITY_SLOT.filter((s) => slots.has(s)),
    budgetMaxCents: BUDGET_WORDS.test(text) ? extracted.budgetMaxCents : null,
  };
}

function normalizeTags(tags: readonly string[]): string[] {
  const out = tags.map((t) => TagSchema.safeParse(t)).flatMap((r) => (r.success ? [r.data] : []));
  return [...new Set(out)];
}

function union<T>(a: readonly T[], b: readonly T[]): T[] {
  return [...new Set([...a, ...b])];
}

type ArrayField = "interests" | "interestCategories" | "availabilitySlots" | "socialGoals" | "activityPrefs" | "dealbreakers";

/**
 * Merge an extraction into current preferences. Arrays are unioned; scalars are
 * set only when extracted and not already confirmed by the user. Every field the
 * extraction changes is marked `ai_inferred`; `user_set` fields keep their source.
 */
export function mergeExtraction(
  current: UserPreferencesWithSources,
  extracted: ExtractedPreferences,
): UserPreferencesWithSources {
  const incoming: Pick<UserPreferences, ArrayField> = {
    interests: normalizeTags(extracted.interests.map((i) => i.tag)),
    interestCategories: extracted.interestCategories,
    availabilitySlots: extracted.availabilitySlots,
    socialGoals: extracted.socialGoals,
    activityPrefs: normalizeTags(extracted.activityPrefs),
    dealbreakers: normalizeTags(extracted.dealbreakers),
  };
  const arrays = Object.fromEntries(
    (Object.keys(incoming) as ArrayField[]).map((f) => [f, union<string>(current[f], incoming[f])]),
  ) as Pick<UserPreferences, ArrayField>;

  const isUserSet = (f: PreferenceField) => current.fieldSources[f] === "user_set";
  const groupSizePref =
    extracted.groupSizePref && !isUserSet("groupSizePref") ? extracted.groupSizePref : current.groupSizePref;
  const budgetMaxCents =
    extracted.budgetMaxCents != null && !isUserSet("budgetMaxCents")
      ? extracted.budgetMaxCents
      : current.budgetMaxCents;

  const next: UserPreferences = { ...current, ...arrays, groupSizePref, budgetMaxCents };
  return { ...next, fieldSources: markChanged(current, next) };
}

function markChanged(before: UserPreferencesWithSources, after: UserPreferences): FieldSources {
  const changed = (Object.keys(after) as PreferenceField[]).filter(
    (f) => JSON.stringify(before[f]) !== JSON.stringify(after[f]) && before.fieldSources[f] !== "user_set",
  );
  return { ...before.fieldSources, ...Object.fromEntries(changed.map((f) => [f, "ai_inferred"])) };
}

export type OnboardingStep = { done: false; question: string } | { done: true };

/**
 * Decide whether to ask the model's follow-up question or move to review.
 * `userTurns` counts user messages including the current one.
 */
export function nextOnboardingStep(
  extracted: ExtractedPreferences,
  userTurns: number,
  followUpsAsked: number,
): OnboardingStep {
  const question = extracted.followUpQuestion?.trim();
  if (!question || followUpsAsked >= MAX_FOLLOW_UPS || userTurns >= MAX_ONBOARDING_TURNS) return { done: true };
  return { done: false, question };
}

/** "I heard: pottery, coffee, Thursday evenings, small groups" style recap. */
export function recap(prefs: UserPreferences): string {
  const slotLabel = (s: string) => {
    const [d, p] = s.split("_");
    const days: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
    const day = days[d ?? ""] ?? s;
    return `${day} ${p === "eve" ? "evenings" : "daytime"}`;
  };
  const size = prefs.groupSizePref ? `${prefs.groupSizePref.replace(/_/g, " ")} groups` : null;
  const parts = [...prefs.interests, ...prefs.availabilitySlots.map(slotLabel), ...(size ? [size] : [])];
  return parts.length ? `Here's what I heard: ${parts.join(", ")}.` : "Tell me a little more about what you enjoy.";
}
