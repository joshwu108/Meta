import "server-only";
import type { RsvpStatus } from "@/shared/enums";
import type { BusinessPublicCard, EventPublic, EventSummary } from "@/shared/types";
import type { EventRow } from "../schemas";
import type { LatLng } from "./geo";

export function toBusinessCard(b: EventRow["businesses"]): BusinessPublicCard {
  return {
    id: b.id,
    name: b.name,
    category: b.category,
    neighborhood: b.neighborhood ?? "",
    address: b.address,
    description: b.description ?? "",
    imageUrl: b.image_url,
  };
}

export function venueOf(row: EventRow): LatLng {
  return { lat: row.businesses.lat, lng: row.businesses.lng };
}

export function toEventSummary(row: EventRow, rsvpStatus: RsvpStatus | null): EventSummary {
  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    status: row.status,
    business: toBusinessCard(row.businesses),
    rsvpStatus,
  };
}

export function toEventPublic(row: EventRow, confirmedCount: number, rsvpStatus: RsvpStatus | null): EventPublic {
  return {
    ...toEventSummary(row, rsvpStatus),
    description: row.description,
    category: row.category,
    endsAt: row.ends_at,
    capacity: row.capacity,
    confirmedCount,
    priceCents: row.price_cents,
    format: row.format ?? "",
    source: row.source,
  };
}
