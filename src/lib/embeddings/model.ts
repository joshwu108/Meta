import 'server-only';
import { ApiError } from '@/lib/api/errors';

/**
 * Local sentence embeddings. Meta's Model API has no `/v1/embeddings` endpoint, so vectors are
 * produced in-process by a small sentence-transformer rather than bought from a vendor.
 *
 * The model is loaded once per process and reused: the first call pays a download (cached under
 * node_modules/.cache) plus a second or two of start-up, every call after that is fast.
 */

/** 384 dimensions, matching `vector(384)` in migration 0702. */
export const EMBEDDING_DIMENSIONS = 384;

/** Overridable so a deployment can swap models, but the dimension must still be 384. */
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';

type Extractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;

let extractor: Promise<Extractor> | null = null;

/** Lazily construct the feature-extraction pipeline. Cached across calls, including failures. */
async function getExtractor(): Promise<Extractor> {
  if (!extractor) {
    extractor = (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      return (await pipeline('feature-extraction', EMBEDDING_MODEL)) as unknown as Extractor;
    })().catch((error: unknown) => {
      // Do not cache a failed load: a transient download error should be retryable.
      extractor = null;
      throw error;
    });
  }
  return extractor;
}

/** Test seam: install a fake extractor (or `null` to restore the real one). */
export function setExtractor(next: Extractor | null): void {
  extractor = next ? Promise.resolve(next) : null;
}

/**
 * Mean-pooled, L2-normalised vectors, one per input. Normalised so cosine similarity is a plain
 * dot product and pgvector's `<=>` distance is `1 - similarity`.
 */
export async function embed(texts: readonly string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  try {
    const run = await getExtractor();
    const output = await run([...texts], { pooling: 'mean', normalize: true });
    const vectors = output.tolist();
    for (const vector of vectors) {
      if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`model ${EMBEDDING_MODEL} returned ${vector.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`);
      }
    }
    return vectors;
  } catch (error) {
    throw new ApiError('AI_UNAVAILABLE', 'The embedding model is unavailable', 503, {
      model: EMBEDDING_MODEL,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

/** One vector. Convenience over `embed`. */
export async function embedOne(text: string): Promise<number[]> {
  const [vector] = await embed([text]);
  if (!vector) throw new ApiError('AI_UNAVAILABLE', 'The embedding model returned nothing', 503);
  return vector;
}

/** Cosine similarity for already-normalised vectors, clamped to [0, 1]. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += (a[i] as number) * (b[i] as number);
  return Math.min(1, Math.max(0, dot));
}
