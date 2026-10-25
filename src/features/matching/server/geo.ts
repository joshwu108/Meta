/** Coarse-location math. Inputs are the 2-dp coordinates users share (~1 km precision). */

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE_LAT = 111.32;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A point when both coordinates are known numbers, else null. */
export function toLatLng(lat: number | null | undefined, lng: number | null | undefined): LatLng | null {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** Lat/lng box that contains every point within `radiusKm` of `center` (for SQL prefilters). */
export function boundingBox(center: LatLng, radiusKm: number) {
  const dLat = radiusKm / KM_PER_DEGREE_LAT;
  const cosLat = Math.max(Math.cos(toRadians(center.lat)), 0.01);
  const dLng = radiusKm / (KM_PER_DEGREE_LAT * cosLat);
  return { minLat: center.lat - dLat, maxLat: center.lat + dLat, minLng: center.lng - dLng, maxLng: center.lng + dLng };
}

/** Mean of the points, rounded to 2 dp like every coarse coordinate. Null for no points. */
export function centroid(points: readonly LatLng[]): LatLng | null {
  if (points.length === 0) return null;
  const sum = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  const round = (value: number) => Math.round(value * 100) / 100;
  return { lat: round(sum.lat / points.length), lng: round(sum.lng / points.length) };
}
