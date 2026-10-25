import 'server-only';

/**
 * Spec section 6: "Geocode address server-side with a static neighborhood lookup for the
 * demo (no external API required); accept lat/lng override."
 *
 * The demo city is San Francisco. An address that matches no neighborhood falls back to
 * the city centre and an empty label, which the onboarding Review step shows so the owner
 * can correct it by entering coordinates.
 */

export type GeocodeResult = {
  neighborhood: string;
  lat: number;
  lng: number;
  matched: boolean;
};

type Neighborhood = { label: string; lat: number; lng: number; aliases: readonly string[] };

export const NEIGHBORHOODS: readonly Neighborhood[] = [
  { label: 'Mission', lat: 37.7599, lng: -122.4148, aliases: ['mission', 'valencia', 'bernal'] },
  { label: 'Hayes Valley', lat: 37.7765, lng: -122.4255, aliases: ['hayes', 'octavia', 'fell st'] },
  { label: 'North Beach', lat: 37.8003, lng: -122.4096, aliases: ['north beach', 'columbus ave', 'grant ave'] },
  { label: 'SoMa', lat: 37.7785, lng: -122.4056, aliases: ['soma', 'south of market', 'folsom', 'howard st'] },
  { label: 'Castro', lat: 37.7609, lng: -122.435, aliases: ['castro', 'noe', '18th st'] },
  { label: 'Richmond', lat: 37.7801, lng: -122.4644, aliases: ['richmond', 'clement st', 'geary blvd'] },
  { label: 'Sunset', lat: 37.7533, lng: -122.4842, aliases: ['sunset', 'irving st', 'judah st'] },
  { label: 'Potrero Hill', lat: 37.7576, lng: -122.4007, aliases: ['potrero', 'dogpatch', '18th and texas'] },
];

export const CITY_CENTER = { lat: 37.7749, lng: -122.4194 } as const;

export type GeocodeOverride = { neighborhood?: string; lat?: number; lng?: number };

/** An explicit neighborhood or lat/lng from the form always wins over the lookup. */
export function geocodeAddress(address: string, override: GeocodeOverride = {}): GeocodeResult {
  const haystack = address.toLowerCase();
  const hit = NEIGHBORHOODS.find(
    (n) => haystack.includes(n.label.toLowerCase()) || n.aliases.some((alias) => haystack.includes(alias)),
  );
  const named = override.neighborhood
    ? NEIGHBORHOODS.find((n) => n.label.toLowerCase() === override.neighborhood?.toLowerCase())
    : undefined;
  const base = named ?? hit;

  return {
    neighborhood: override.neighborhood ?? base?.label ?? '',
    lat: override.lat ?? base?.lat ?? CITY_CENTER.lat,
    lng: override.lng ?? base?.lng ?? CITY_CENTER.lng,
    matched: base !== undefined || (override.lat !== undefined && override.lng !== undefined),
  };
}

/** `Kiln & Cup` -> `kiln-cup`. Collisions are resolved by the caller with a numeric suffix. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug.length > 0 ? slug : 'venue';
}
