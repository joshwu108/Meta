import type { EventRow } from "@/features/events/schemas";

export const KILN = {
  id: "00000000-0000-4000-8000-0000000000b1",
  name: "Kiln & Cup",
  category: "creative" as const,
  neighborhood: "Mission",
  address: "1 Valencia St",
  description: "Pottery studio",
  image_url: null,
  lat: 37.7599,
  lng: -122.4148,
};

export function eventRow(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "00000000-0000-4000-8000-0000000000e1",
    business_id: KILN.id,
    source: "ai_proposal",
    title: "Beginner Pottery & Coffee Night",
    description: "Learn the wheel with coffee.",
    category: "creative",
    format: "workshop",
    starts_at: "2099-10-30T02:00:00Z",
    ends_at: "2099-10-30T04:00:00Z",
    capacity: 10,
    price_cents: 2500,
    status: "published",
    updated_at: "2099-10-01T00:00:00Z",
    businesses: KILN,
    ...overrides,
  };
}

export const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
