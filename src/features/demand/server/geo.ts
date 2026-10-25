const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export type Cell = { row: number; col: number };

/** Integer cell indices on a `degrees` grid. Floors, so negative longitudes bucket consistently. */
export function toCell(lat: number, lng: number, degrees: number): Cell {
  return { row: Math.floor(round6(lat / degrees)), col: Math.floor(round6(lng / degrees)) };
}

/** Avoids 37.76 / 0.02 = 1887.9999999 style float drift putting a point in the wrong cell. */
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** Cell id as the lat,lng of its south-west corner, e.g. '37.76,-122.42' (spec §4 `geocell`). */
export function cellId(cell: Cell, degrees: number): string {
  return `${(cell.row * degrees).toFixed(2)},${(cell.col * degrees).toFixed(2)}`;
}

/** True for the 8 surrounding cells (not the cell itself). */
export function areNeighbors(a: Cell, b: Cell): boolean {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  return dr <= 1 && dc <= 1 && dr + dc > 0;
}

export function centroid(points: readonly { lat: number; lng: number }[]): { lat: number; lng: number } {
  const n = Math.max(points.length, 1);
  const sum = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: round2(sum.lat / n), lng: round2(sum.lng / n) };
}

export const round2 = (v: number): number => Math.round(v * 100) / 100;
