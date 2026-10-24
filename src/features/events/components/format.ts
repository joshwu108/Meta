// Display helpers shared by server and client components. Times always render in the city's zone.
const ZONE = "America/Los_Angeles";

const dayTime = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const timeOnly = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" });

/** "Thu, Oct 29, 7:00 PM" */
export const formatWhen = (iso: string) => dayTime.format(new Date(iso));

/** "7:00 PM" */
export const formatTime = (iso: string) => timeOnly.format(new Date(iso));

/** "Free" or "$25" / "$12.50" */
export function formatPrice(cents: number | null): string {
  if (!cents) return "Free";
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export const SLOT_PHRASES: Record<string, string> = {
  mon_eve: "Monday evening", tue_eve: "Tuesday evening", wed_eve: "Wednesday evening", thu_eve: "Thursday evening",
  fri_eve: "Friday evening", sat_day: "Saturday morning", sat_eve: "Saturday evening", sun_day: "Sunday morning", sun_eve: "Sunday evening",
};
