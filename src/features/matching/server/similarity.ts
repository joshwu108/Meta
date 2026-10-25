/** Set similarity helpers shared by the scorer and the group planner. */

/** Lowercase kebab tag: "Board Games" → "board-games". */
export function normalizeTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Normalized, de-duplicated, non-empty tags in first-seen order. */
export function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map(normalizeTag).filter((tag) => tag.length > 0))];
}

/** Items of `a` that are also in `b`, in `a`'s order, without duplicates. */
export function intersect<T>(a: readonly T[], b: readonly T[]): T[] {
  const other = new Set(b);
  return [...new Set(a)].filter((item) => other.has(item));
}

/** |a ∩ b| / |a ∪ b|; 0 when both are empty. */
export function jaccard<T>(a: readonly T[], b: readonly T[]): number {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  return intersect(a, b).length / union.size;
}

/**
 * Jaccard where each item carries a weight: Σw(a ∩ b) / Σw(a ∪ b). Both maps use the same
 * weight per key. 0 when both are empty.
 */
export function weightedJaccard(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number {
  const keys = new Set([...a.keys(), ...b.keys()]);
  let union = 0;
  let shared = 0;
  for (const key of keys) {
    const weight = a.get(key) ?? b.get(key) ?? 0;
    union += weight;
    if (a.has(key) && b.has(key)) shared += weight;
  }
  return union === 0 ? 0 : shared / union;
}

/** Clamp to [0, 1]. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
