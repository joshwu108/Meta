/**
 * Small in-memory TTL cache. State lives in process memory, so it is per server instance and
 * resets on deploy; that is what the spec asks for (5-minute match cache, 24h explanation cache).
 */
export type TtlCache<V> = {
  get: (key: string) => V | undefined;
  set: (key: string, value: V) => void;
  delete: (key: string) => void;
  deleteWhere: (predicate: (key: string) => boolean) => void;
  clear: () => void;
  size: () => number;
};

type Entry<V> = { value: V; expiresAt: number };

export function createTtlCache<V>(opts: { ttlMs: number; maxEntries: number; now?: () => number }): TtlCache<V> {
  const now = opts.now ?? Date.now;
  const entries = new Map<string, Entry<V>>();

  const get = (key: string): V | undefined => {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry.value;
  };

  const set = (key: string, value: V): void => {
    entries.delete(key);
    entries.set(key, { value, expiresAt: now() + opts.ttlMs });
    // Map keeps insertion order, so the first key is the oldest write.
    while (entries.size > opts.maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  };

  const deleteWhere = (predicate: (key: string) => boolean): void => {
    for (const key of [...entries.keys()]) if (predicate(key)) entries.delete(key);
  };

  return {
    get,
    set,
    delete: (key) => void entries.delete(key),
    deleteWhere,
    clear: () => entries.clear(),
    size: () => entries.size,
  };
}
