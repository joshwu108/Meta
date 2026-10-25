import type { AvailabilitySlot, GroupSizePref, SocialGoal } from "@/shared/enums";
import type { ConsentKey } from "../schemas";

export const SLOT_LABEL: Record<AvailabilitySlot, string> = {
  mon_eve: "Mon evening",
  tue_eve: "Tue evening",
  wed_eve: "Wed evening",
  thu_eve: "Thu evening",
  fri_eve: "Fri evening",
  sat_day: "Sat daytime",
  sat_eve: "Sat evening",
  sun_day: "Sun daytime",
  sun_eve: "Sun evening",
};

export const GROUP_SIZE_LABEL: Record<GroupSizePref, string> = {
  one_on_one: "One-on-one",
  small: "Small (3–6)",
  medium: "Medium (7–12)",
  large: "Large (13+)",
};

export const GOAL_LABEL: Record<SocialGoal, string> = {
  make_friends: "Make friends",
  explore_city: "Explore the city",
  learn_skill: "Learn a skill",
  find_activity_partners: "Find activity partners",
  network: "Network",
};

/** Plain-English consent descriptions: what each enables and who sees what. */
export const CONSENT_COPY: Record<ConsentKey, { title: string; body: string }> = {
  allow_matching: {
    title: "Match me with people",
    body: "Your interests, availability and neighborhood are used to suggest compatible people. They see your name and shared interests, never your chats.",
  },
  allow_demand_aggregation: {
    title: "Count me toward local events",
    body: "Your interests and free times are counted anonymously so venues can propose events. Businesses only ever see totals of 4 or more.",
  },
  allow_group_planning: {
    title: "Help plan my groups",
    body: "Your availability and interests are used when a group you belong to asks the planner for ideas.",
  },
  share_interests_with_attendees: {
    title: "Show my interests to fellow attendees",
    body: "People going to the same event can see the interests you have in common.",
  },
  share_name_with_business: {
    title: "Share my name with event hosts",
    body: "Hosts see your display name on their attendee list. Off means you appear as \"Guest\".",
  },
};

export const SF_NEIGHBORHOODS: ReadonlyArray<{ name: string; lat: number; lng: number }> = [
  { name: "Mission District", lat: 37.76, lng: -122.42 },
  { name: "Castro", lat: 37.76, lng: -122.43 },
  { name: "Noe Valley", lat: 37.75, lng: -122.43 },
  { name: "SoMa", lat: 37.78, lng: -122.4 },
  { name: "Hayes Valley", lat: 37.78, lng: -122.42 },
  { name: "Bernal Heights", lat: 37.74, lng: -122.42 },
  { name: "Potrero Hill", lat: 37.76, lng: -122.4 },
  { name: "Haight-Ashbury", lat: 37.77, lng: -122.45 },
  { name: "Inner Sunset", lat: 37.76, lng: -122.47 },
  { name: "Richmond", lat: 37.78, lng: -122.48 },
  { name: "North Beach", lat: 37.8, lng: -122.41 },
  { name: "Marina", lat: 37.8, lng: -122.44 },
  { name: "Pacific Heights", lat: 37.79, lng: -122.43 },
  { name: "Nob Hill", lat: 37.79, lng: -122.41 },
  { name: "Dogpatch", lat: 37.76, lng: -122.39 },
  { name: "Glen Park", lat: 37.73, lng: -122.43 },
];

/**
 * Neighborhood typed in onboarding: an exact name, or a unique prefix of at least 3 letters
 * ("mission" → Mission District). Returns null when nothing or several names match.
 */
export function matchNeighborhood(input: string): (typeof SF_NEIGHBORHOODS)[number] | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  const exact = SF_NEIGHBORHOODS.find((n) => n.name.toLowerCase() === q);
  if (exact) return exact;
  if (q.length < 3) return null;
  const prefixed = SF_NEIGHBORHOODS.filter((n) => n.name.toLowerCase().startsWith(q));
  return prefixed.length === 1 ? (prefixed[0] ?? null) : null;
}
