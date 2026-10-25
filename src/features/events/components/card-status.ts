import type { EventCard } from "../server/cards";

export type CardStatus = { kind: "reconfirm" } | { kind: "status"; status: string } | null;

/**
 * The one status an event card shows, most important first: the event's own end state
 * (cancelled, completed), then a pending reconfirm, then the viewer's RSVP, then "full".
 */
export function cardStatus(event: Pick<EventCard, "status" | "needsReconfirm" | "rsvpStatus" | "isFull">): CardStatus {
  if (event.status === "cancelled" || event.status === "completed") return { kind: "status", status: event.status };
  if (event.needsReconfirm) return { kind: "reconfirm" };
  if (event.rsvpStatus === "confirmed" || event.rsvpStatus === "waitlisted") return { kind: "status", status: event.rsvpStatus };
  if (event.isFull) return { kind: "status", status: "full" };
  return null;
}
