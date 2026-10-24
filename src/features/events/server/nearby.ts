import "server-only";
import type { BusinessPublicCard, EventSummary } from "@/shared/types";
import { EventRow } from "../schemas";
import { haversineKm } from "./geo";
import { toBusinessCard, toEventSummary } from "./mappers";
import { listLiveEventsBetween, viewerLocation } from "./repo";
import { createAdminClient } from "./stubs";

const NEXT_EVENT_WINDOW_DAYS = 60;

export type NearbyBusiness = BusinessPublicCard & { distanceKm: number | null; nextEvent: EventSummary | null };

/**
 * GET /businesses/nearby: active venues within `radiusKm` of the viewer's coarse location,
 * nearest first, each with its next live event. Without a location, all venues by name.
 */
export async function getNearbyBusinesses(viewerId: string, radiusKm: number): Promise<NearbyBusiness[]> {
  const admin = createAdminClient();
  const now = new Date();
  const [here, { data, error }, upcoming] = await Promise.all([
    viewerLocation(admin, viewerId),
    admin.from("businesses").select("id, name, category, neighborhood, address, description, image_url, lat, lng").eq("is_active", true),
    listLiveEventsBetween(admin, now, new Date(now.getTime() + NEXT_EVENT_WINDOW_DAYS * 86_400_000)),
  ]);
  if (error) throw new Error(error.message);

  const nextByBusiness = new Map<string, EventRow>();
  for (const row of upcoming) if (!nextByBusiness.has(row.business_id)) nextByBusiness.set(row.business_id, row);

  const located = here.lat !== null && here.lng !== null ? { lat: here.lat, lng: here.lng } : null;
  return (data ?? [])
    .map((raw) => EventRow.shape.businesses.parse(raw))
    .map((b) => {
      const next = nextByBusiness.get(b.id);
      return {
        ...toBusinessCard(b),
        distanceKm: located ? Math.round(haversineKm(located, b) * 10) / 10 : null,
        nextEvent: next ? toEventSummary(next, null) : null,
      };
    })
    .filter((b) => b.distanceKm === null || b.distanceKm <= radiusKm)
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0) || a.name.localeCompare(b.name));
}
