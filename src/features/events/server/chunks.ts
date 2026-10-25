import "server-only";

/**
 * PostgREST sends `.in(...)` filters in the URL, and a few hundred UUIDs overflow it
 * (ws/03-matching hit the same limit). Every id-list read goes through `inChunks`.
 */
export const ID_CHUNK = 100;

export function chunk<T>(items: readonly T[], size = ID_CHUNK): T[][] {
  if (size < 1) throw new RangeError("chunk size must be positive");
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

/** Runs `read` once per chunk of `ids` (in parallel) and concatenates the rows. */
export async function inChunks<T, R>(ids: readonly T[], read: (part: T[]) => Promise<R[]>, size = ID_CHUNK): Promise<R[]> {
  const results = await Promise.all(chunk(ids, size).map(read));
  return results.flat();
}
