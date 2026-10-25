import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { runSeedWith } from '../../../supabase/seed/runner';
import { applyDemoUserScene1, applyInterimPreferences, seededUserIds } from '../../fixtures/social/preferences';

vi.mock('server-only', () => ({}));

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const { getMatchesForViewer, invalidateMatches } = await import('@/features/matching/server/matches');

let ids: Map<string, string>;
let demoId: string;

beforeAll(async () => {
  await runSeedWith(admin);
  await applyInterimPreferences(admin);
  demoId = await applyDemoUserScene1(admin);
  ids = await seededUserIds(admin);
}, 60_000);

describe('AC1: seeded demo user after Scene 1', () => {
  it('gets ranked matches whose top 3 share creative interests and Thursday evenings', async () => {
    invalidateMatches(demoId);
    const result = await getMatchesForViewer(demoId, { limit: 20 });
    expect(result.status).toBe('ok');
    expect(result.matches.length).toBeGreaterThanOrEqual(3);
    for (const match of result.matches.slice(0, 3)) {
      expect(match.sharedInterests).toContain('creative');
      expect(match.sharedSlots).toContain('thu_eve');
    }
    const scores = result.matches.map((m) => m.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(result.matches[0]!.user.displayName).toBe('Maya Chen');
  });

  it('never shows non-discoverable seeded users', async () => {
    const result = await getMatchesForViewer(demoId, { limit: 20 });
    const shown = new Set(result.matches.map((m) => m.user.id));
    expect(shown.has(ids.get('dev@weave.test')!)).toBe(false);
    expect(shown.has(ids.get('harper@weave.test')!)).toBe(false);
  });

  it('keeps the seeded block pair apart in both directions', async () => {
    const kai = ids.get('kai@weave.test')!;
    const leo = ids.get('leo@weave.test')!;
    const forKai = await getMatchesForViewer(kai, { limit: 20 });
    const forLeo = await getMatchesForViewer(leo, { limit: 20 });
    expect(forKai.matches.map((m) => m.user.id)).not.toContain(leo);
    expect(forLeo.matches.map((m) => m.user.id)).not.toContain(kai);
  });

  it('explains each card with something the two actually share', async () => {
    const result = await getMatchesForViewer(demoId, { limit: 5 });
    for (const match of result.matches) expect(match.explanation.toLowerCase()).toMatch(/pottery|coffee|creative|thursday/);
  });
});
