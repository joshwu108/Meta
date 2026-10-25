import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROMPT_IDS, PROMPTS, type PromptId } from '@/lib/ai/prompts';

/**
 * The registry's own contract (`src/lib/ai/prompts/index.ts`): every id a workstream registers
 * ships a system prompt and a fixture, so `MOCK_AI=1` works for it in CI, in the demo and offline.
 * Without this, a stale id sits in the registry promising a fixture that was never written, and
 * the first caller to reach for it fails at runtime instead of here.
 */

const FIXTURE_DIR = path.join('src', 'lib', 'ai', 'fixtures');

const fixtureFiles = (): string[] =>
  readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, ''));

describe('prompt registry', () => {
  it('registers at least the prompts the product calls', () => {
    expect(PROMPT_IDS.length).toBeGreaterThan(0);
  });

  it('gives every registered prompt a system prompt and a model tier', () => {
    for (const id of PROMPT_IDS) {
      const definition = PROMPTS[id];
      expect(definition, `no definition for "${id}"`).toBeDefined();
      expect(definition!.system.length, `empty system prompt for "${id}"`).toBeGreaterThan(0);
      expect(['fast', 'smart']).toContain(definition!.model);
    }
  });

  it('ships a fixture for every registered prompt', () => {
    const available = new Set(fixtureFiles());
    const missing = PROMPT_IDS.filter((id) => !available.has(id));
    expect(missing, `registered with no fixture: ${missing.join(', ')}`).toEqual([]);
  });

  it('keeps no fixture for a prompt nobody registered', () => {
    const registered = new Set<string>(PROMPT_IDS);
    const orphans = fixtureFiles().filter((name) => !registered.has(name));
    expect(orphans, `fixtures with no registered prompt: ${orphans.join(', ')}`).toEqual([]);
  });

  it('holds fixtures that parse, and that answer every case they declare', () => {
    for (const id of PROMPT_IDS as readonly PromptId[]) {
      const raw = readFileSync(path.join(FIXTURE_DIR, `${id}.json`), 'utf8');
      const parsed = JSON.parse(raw) as { cases?: Array<{ output?: unknown }> };
      expect(parsed, `empty fixture for "${id}"`).toBeTruthy();
      for (const [index, entry] of (parsed.cases ?? []).entries()) {
        expect(entry.output, `case ${index} of "${id}" has no output`).toBeDefined();
      }
    }
  });
});
