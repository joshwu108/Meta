import 'server-only';
import { getOwnPreferencesForImport } from '@/features/agent';
import { logAgentAction } from '@/features/core';
import { generateStructured } from '@/lib/ai';
import { aiRateLimiter, ApiError } from '@/lib/api';
import { log } from '@/lib/log';
import { MapLabelsOutputSchema, ReadScreensOutputSchema, type MapLabelsOutput, type ScreensRunResult } from '../schemas';
import { toVisionImages } from './images';
import { aggregate, dedupe, dislikeCandidates, matchVocabulary, screensToSignals, summaryMentions, validateMappings, type Signal } from './pipeline';
import * as repo from './repo';
import { ACTIVITY_STYLE_TAGS, INTEREST_TAGS } from './vocabulary';
import { MAX_RUNS_PER_DAY } from './weights';

export const SHARE_SOURCES = ['your_algorithm', 'explore'] as const;
export type ShareSource = (typeof SHARE_SOURCES)[number];

/** Recorded on suggestions the mapping model produced (prompt id + version). */
const MAP_MODEL = 'import.map_labels@1';

/** Leftover labels onto the vocabulary. A failed call keeps the exact matches (`mapped: false`). */
async function mapLeftovers(leftovers: readonly Signal[]): Promise<{ output: MapLabelsOutput; mapped: boolean }> {
  if (leftovers.length === 0) return { output: { mappings: [] }, mapped: false };
  try {
    const output = await generateStructured({
      prompt: 'import.map_labels',
      input: { labels: leftovers.map((s) => ({ id: s.id, label: s.label })), interests: INTEREST_TAGS, activityStyles: ACTIVITY_STYLE_TAGS },
      schema: MapLabelsOutputSchema,
    });
    return { output, mapped: true };
  } catch (error) {
    log.warn('import.map_labels.unavailable', { code: error instanceof ApiError ? error.code : 'UNKNOWN', leftovers: leftovers.length });
    return { output: { mappings: [] }, mapped: false };
  }
}

/**
 * Screenshots → pending suggestions (spec 07 Phase 1). The images live only in this call's
 * memory: they go to the vision prompt and are dropped. Nothing becomes a preference here.
 */
export async function runScreensImport(
  userId: string,
  files: ReadonlyArray<Uint8Array>,
  sources: readonly ShareSource[],
): Promise<ScreensRunResult> {
  const images = toVisionImages(files);
  aiRateLimiter.assert(userId);
  if ((await repo.countRunsSince(userId, new Date(Date.now() - 86_400_000))) >= MAX_RUNS_PER_DAY) {
    throw new ApiError('RATE_LIMITED', `You can bring in screenshots ${MAX_RUNS_PER_DAY} times a day. Try again tomorrow.`, 429);
  }

  const read = await generateStructured({
    prompt: 'import.read_screens',
    input: { screens: images.length, sources },
    schema: ReadScreensOutputSchema,
    images,
  });
  if (read.screens.every((screen) => screen.kind === 'other')) {
    throw new ApiError('VALIDATION', "That doesn't look like Your Algorithm or Explore.", 400, { field: 'images' });
  }

  const parsed = screensToSignals(read);
  const { mapped, leftovers } = matchVocabulary(parsed.signals);
  const { output, mapped: modelMapped } = await mapLeftovers(leftovers);
  const modelMappings = validateMappings(output, leftovers);

  await repo.deleteExpired(userId);
  const existing = await repo.loadExisting(userId, await getOwnPreferencesForImport(userId));
  const { kept, duplicate } = dedupe(aggregate([...mapped, ...modelMappings], summaryMentions(parsed.summaries)), existing);
  const dislikes = dislikeCandidates(parsed.seeLess, existing);
  const unmapped = leftovers.length - modelMappings.length;

  const stats = {
    screens: images.length,
    signals: parsed.signals.length,
    droppedSensitive: parsed.droppedSensitive,
    exactMatches: mapped.length,
    modelMapped: modelMappings.length,
    unmapped,
    duplicate,
    suggestions: kept.length,
    dislikes: dislikes.length,
    mapUsed: modelMapped,
  };
  const runId = await repo.insertRun(userId, sources, images.length, stats, true);
  const created = await repo.insertSuggestions(userId, runId, kept, dislikes, MAP_MODEL);
  await logAgentAction({
    userId,
    action: 'import_suggest_traits',
    permissionsUsed: ['instagram_screenshots'],
    result: `Suggested ${kept.length} traits and ${dislikes.length} dislikes from ${images.length} screenshot${images.length === 1 ? '' : 's'} you shared`,
  });
  return {
    runId,
    suggestionsCreated: created,
    dropped: { sensitive: parsed.droppedSensitive, unmapped, duplicate },
    aiUsed: true,
  };
}
