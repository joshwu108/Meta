/**
 * Deterministic PRNG for the scale seeder. A fixed seed must produce byte-identical data on
 * every run, so tests can assert on generated rows and a reseed does not churn the database.
 */

/** mulberry32: small, fast, good enough for seed data. */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

/** Integer in [min, max]. */
export function intBetween(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** One element, or undefined for an empty list. */
export function pick<T>(rng: Rng, items: readonly T[]): T | undefined {
  return items.length === 0 ? undefined : items[Math.floor(rng() * items.length)];
}

/** `count` distinct elements (fewer when the pool is smaller), order preserved from a shuffle. */
export function pickSome<T>(rng: Rng, items: readonly T[], count: number): T[] {
  return shuffle(rng, items).slice(0, Math.max(0, Math.min(count, items.length)));
}

/** Fisher-Yates on a copy; never mutates the input. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** True with probability `p`. */
export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

/** A point jittered up to `km` from a centre, as a rough lat/lng offset. */
export function jitterLatLng(rng: Rng, lat: number, lng: number, km: number): { lat: number; lng: number } {
  const dLat = ((rng() - 0.5) * 2 * km) / 111;
  const dLng = ((rng() - 0.5) * 2 * km) / (111 * Math.cos((lat * Math.PI) / 180));
  return { lat: Number((lat + dLat).toFixed(6)), lng: Number((lng + dLng).toFixed(6)) };
}
