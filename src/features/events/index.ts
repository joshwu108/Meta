// Public surface of workstream 06. Other features import only from here.
export { getEventPublic, getUpcomingEventsForUser } from "./server/contracts";
/** Ranked events with grounded explanations for a viewer (used by 02's `suggest_events`). */
export { getRecommendedEvents } from "./server/recommended";
/** Active venues near a viewer with their next event (used by 07's plan). */
export { getNearbyBusinesses, type NearbyBusiness } from "./server/nearby";
export type { EventCard } from "./server/cards";
export type { RecommendedEvent } from "./server/recommended";
/** Wraps 01's notify so event notifications also text the demo phone (used by 05's event fan-out). */
export { withEventSms } from "./server/sms";
