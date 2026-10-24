import "server-only";
import { z } from "zod";
import type { EventsQuery } from "../schemas";
import { buildEventCards, type EventCard } from "./cards";
import { haversineKm } from "./geo";
import { venueOf } from "./mappers";
import { listLiveEvents, viewerLocation } from "./repo";
import { createAdminClient } from "./stubs";

export type EventFeedPage = { items: EventCard[]; total: number; page: number; limit: number };

/**
 * Public feed of published/full events, soonest first. With `radiusKm` and a known viewer
 * location the page is filtered by distance after the date-ordered fetch.
 */
export async function listEventFeed(viewerId: string, query: z.infer<typeof EventsQuery>): Promise<EventFeedPage> {
  const admin = createAdminClient();
  const { rows, total } = await listLiveEvents(admin, query);
  const here = query.radiusKm ? await viewerLocation(admin, viewerId) : null;
  const inRange =
    here?.lat != null && here.lng != null && query.radiusKm
      ? rows.filter((r) => haversineKm({ lat: here.lat!, lng: here.lng! }, venueOf(r)) <= query.radiusKm!)
      : rows;
  const items = await buildEventCards(admin, viewerId, inRange);
  return { items, total: inRange.length === rows.length ? total : items.length, page: query.page, limit: query.limit };
}
