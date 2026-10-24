import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ApiError } from '@/lib/api/errors';
import type { PromptId } from './prompts';

/** Directory holding `<promptId>.json` fixtures used when `MOCK_AI=1`. */
export const FIXTURES_DIR = path.join(process.cwd(), 'src', 'lib', 'ai', 'fixtures');

/** Load the deterministic fixture for a prompt id. Throws `AI_UNAVAILABLE` when it is missing. */
export async function loadFixture(prompt: PromptId): Promise<unknown> {
  const file = path.join(FIXTURES_DIR, `${prompt}.json`);
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch (error) {
    throw new ApiError(
      'AI_UNAVAILABLE',
      `MOCK_AI is on but no fixture exists for prompt "${prompt}" (expected ${file})`,
      503,
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

/**
 * Fixture shape for chat prompts: either a plain string or `{ "reply": "..." }`.
 * Structured prompts store the JSON object the schema expects directly.
 */
export function fixtureToText(fixture: unknown): string {
  if (typeof fixture === 'string') return fixture;
  if (fixture && typeof fixture === 'object' && 'reply' in fixture) {
    const reply = (fixture as { reply: unknown }).reply;
    if (typeof reply === 'string') return reply;
  }
  return JSON.stringify(fixture);
}
