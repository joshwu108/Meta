/**
 * Pull only topic and ad-interest labels out of Instagram "Download your information" JSON files.
 * Pure and shape-based (layouts change), run inside a Web Worker. Everything else in the file
 * (messages, comments, followers, media) is never read past its top-level key.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_LABELS = 300;

export type ExtractedLabels = { topics: string[]; adInterests: string[] };

const TOPIC_KEY = /topic/i;
const INTEREST_KEY = /interest/i;

function labelOf(item: unknown): string | null {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const map = record.string_map_data as Record<string, { value?: unknown }> | undefined;
  if (map && typeof map === 'object') {
    const first = Object.values(map).find((v) => typeof v?.value === 'string');
    if (first) return first.value as string;
  }
  for (const key of ['title', 'name', 'value']) {
    if (typeof record[key] === 'string') return record[key] as string;
  }
  return null;
}

const clean = (labels: Iterable<string>) =>
  [...new Set([...labels].map((l) => l.normalize('NFKC').trim()).filter((l) => l.length > 0 && l.length <= 64))].slice(0, MAX_LABELS);

/** Labels from one parsed JSON file; unknown shapes return nothing. */
export function extractLabels(json: unknown): ExtractedLabels {
  const topics: string[] = [];
  const adInterests: string[] = [];
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { topics, adInterests };
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const bucket = TOPIC_KEY.test(key) ? topics : INTEREST_KEY.test(key) ? adInterests : null;
    if (!bucket) continue;
    for (const item of value) {
      const label = labelOf(item);
      if (label) bucket.push(label);
    }
  }
  return { topics: clean(topics), adInterests: clean(adInterests) };
}

export function mergeLabels(parts: readonly ExtractedLabels[]): ExtractedLabels {
  return { topics: clean(parts.flatMap((p) => p.topics)), adInterests: clean(parts.flatMap((p) => p.adInterests)) };
}
