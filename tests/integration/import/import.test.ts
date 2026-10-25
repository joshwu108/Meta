import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, createTestUser, type TestUser } from '../helpers';
import { cleanupSocialUsers, setProfile, setTestOrigin } from '../social/support';

vi.mock('server-only', () => ({}));
vi.stubEnv('MOCK_AI', '1');
vi.stubEnv('IMPORT_ENABLED', '1');

const { runScreensImport } = await import('@/features/import/server/run');
const { decideSuggestions } = await import('@/features/import/server/decide');
const { listPending, deleteExpired } = await import('@/features/import/server/repo');
const { canUseImport } = await import('@/features/import');
const { getSharablePreferences } = await import('@/features/agent');
const { getMatchesForViewer, invalidateMatches } = await import('@/features/matching');
const { getRecommendedEvents } = await import('@/features/events');
const { runOpportunityPipeline } = await import('@/features/demand');
const { aiRateLimiter } = await import('@/lib/api');
const { setLogSink } = await import('@/lib/log');

setTestOrigin('import');
const admin = adminClient();
const screenshot = new Uint8Array(readFileSync('tests/fixtures/import/your-algorithm-synthetic.png'));
let maya: TestUser, peer: TestUser, stranger: TestUser, owner: TestUser;

const run = (u: TestUser) => runScreensImport(u.id, [screenshot], ['your_algorithm']);

beforeAll(async () => {
  [maya, peer, stranger, owner] = await Promise.all([
    createTestUser(admin, 'import-maya'),
    createTestUser(admin, 'import-peer'),
    createTestUser(admin, 'import-stranger'),
    createTestUser(admin, 'import-owner', { signup_as: 'business' }),
  ]);
  const consent = { matching: true, groupPlan: true, demand: true };
  await setProfile(admin, maya, { interests: ['coffee'], categories: ['food_drink'] }, consent);
  await setProfile(admin, peer, { interests: ['ceramics', 'board-games'], categories: ['creative', 'games'] }, consent);
  await setProfile(admin, stranger, {}, consent);
  const biz = await admin.from('businesses').insert({
    owner_id: owner.id, name: 'Import RLS Studio', slug: `ws07-rls-${Date.now()}`, category: 'creative',
    address: '1 Test St', lat: 37.76, lng: -122.42,
  });
  if (biz.error) throw new Error(biz.error.message);
});

afterAll(async () => {
  await cleanupSocialUsers(admin);
});

describe('screenshot import → review (MOCK_AI)', () => {
  it('is gated on the flag and adult confirmation', async () => {
    expect(await canUseImport(maya.id)).toBe(true);
    await admin.from('profiles').update({ is_adult_confirmed: false }).eq('id', stranger.id);
    expect(await canUseImport(stranger.id)).toBe(false);
    await admin.from('profiles').update({ is_adult_confirmed: true }).eq('id', stranger.id);
  });

  it('creates banded suggestions with evidence, no sensitive ones, and a Less of this card', async () => {
    const result = await run(maya);
    expect(result.suggestionsCreated).toBeGreaterThan(0);
    expect(result.dropped.sensitive).toBeGreaterThanOrEqual(1);
    const pending = await listPending(maya.id);
    const values = pending.map((s) => s.value);
    expect(values).toEqual(expect.arrayContaining(['ceramics', 'pottery', 'board-games', 'hiking', 'horror-movies']));
    expect(values).not.toContain('coffee'); // already in her profile
    expect(values.some((v) => /wellness|supplement|ignore/.test(v))).toBe(false);
    expect(pending.find((s) => s.value === 'ceramics')).toMatchObject({ band: 'strong', field: 'interests' });
    expect(pending.find((s) => s.value === 'horror-movies')).toMatchObject({ field: 'dislike' });
    expect(pending.every((s) => s.evidence.length >= 1 && s.evidence.length <= 3)).toBe(true);
    const runs = await admin.from('import_runs').select('stats').eq('user_id', maya.id);
    expect(JSON.stringify(runs.data)).not.toMatch(/Ceramics|Wellness|Ignore/);
  });

  it('pending suggestions change nothing in 02, 03, 04 or 06', async () => {
    invalidateMatches(maya.id, peer.id);
    const [prefs, matches, events, demand] = await Promise.all([
      getSharablePreferences(maya.id, 'matching'),
      getMatchesForViewer(peer.id, { limit: 20 }),
      getRecommendedEvents(maya.id, 8),
      runOpportunityPipeline({ triggeredBy: 'manual', dryRun: true }),
    ]);
    expect(prefs?.interests).toEqual(['coffee']);
    const mayaCard = matches.matches.find((m) => m.user.id === maya.id);
    expect(mayaCard?.sharedInterests ?? []).not.toContain('ceramics');
    expect(events.length).toBeGreaterThanOrEqual(0);
    expect(demand.dryRun).toBe(true);
    // Same answers again with the suggestions still pending.
    invalidateMatches(maya.id, peer.id);
    const again = await getMatchesForViewer(peer.id, { limit: 20 });
    expect(again.matches.find((m) => m.user.id === maya.id)?.score).toBe(mayaCard?.score);
    expect((await getRecommendedEvents(maya.id, 8)).map((e) => e.event.id)).toEqual(events.map((e) => e.event.id));
    expect((await runOpportunityPipeline({ triggeredBy: 'manual', dryRun: true })).clustersDetected).toBe(demand.clustersDetected);
  });

  it('decide writes a union to user_preferences with provenance and dislikes', async () => {
    const pending = await listPending(maya.id);
    const pick = (value: string) => pending.find((s) => s.value === value)!.id;
    const result = await decideSuggestions(maya.id, {
      decisions: [
        { id: pick('ceramics'), action: 'love' },
        { id: pick('board-games'), action: 'yes' },
        { id: pick('hiking'), action: 'not_me' },
        { id: pick('horror-movies'), action: 'keep_dislike' },
      ],
    });
    expect(result).toMatchObject({ added: 2, dismissed: 1, dislikes: 1 });
    const prefs = await admin.from('user_preferences').select('interests, interest_categories, field_sources').eq('user_id', maya.id).single();
    expect(prefs.data!.interests).toEqual(['coffee', 'ceramics', 'board-games']);
    expect(prefs.data!.interest_categories).toEqual(expect.arrayContaining(['food_drink', 'creative', 'games']));
    expect(prefs.data!.field_sources).toMatchObject({ interests: 'user_set' });
    const prov = await admin.from('trait_provenance').select('value, strength, origin').eq('user_id', maya.id).order('value');
    expect(prov.data).toEqual([
      { value: 'board-games', strength: 'yes', origin: 'import_accepted' },
      { value: 'ceramics', strength: 'love', origin: 'import_accepted' },
    ]);
    const dislikes = await admin.from('taste_dislikes').select('label, source').eq('user_id', maya.id).order('label');
    expect(dislikes.data).toEqual([{ label: 'hiking', source: 'not_me' }, { label: 'horror-movies', source: 'see_less' }]);
    expect((await getSharablePreferences(maya.id, 'matching'))?.interests).toEqual(expect.arrayContaining(['ceramics', 'board-games']));
    const decided = await admin.from('trait_suggestions').select('evidence').eq('id', pick('ceramics')).single();
    expect(decided.data!.evidence).toEqual([]);
  });

  it('a second decision on the same card is a CONFLICT and changes nothing', async () => {
    const { data } = await admin.from('trait_suggestions').select('id').eq('user_id', maya.id).eq('value', 'ceramics').single();
    const pending = await listPending(maya.id);
    await expect(
      decideSuggestions(maya.id, { decisions: [{ id: pending[0]!.id, action: 'yes' }, { id: data!.id, action: 'yes' }] }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await listPending(maya.id)).map((s) => s.id)).toContain(pending[0]!.id);
  });

  it('re-import skips not-me values, profile values and pending ones', async () => {
    aiRateLimiter.reset();
    const before = await listPending(maya.id);
    await run(maya);
    const after = (await listPending(maya.id)).map((s) => s.value);
    expect(after).not.toContain('hiking');
    expect(after).not.toContain('ceramics');
    expect(after).not.toContain('horror-movies');
    expect(after.length).toBe(before.length);
  });

  it('never writes image bytes to the logs or the database', async () => {
    aiRateLimiter.reset();
    const lines: string[] = [];
    const restore = setLogSink((line) => lines.push(line));
    try {
      await run(stranger);
    } finally {
      restore();
    }
    const base64 = Buffer.from(screenshot).toString('base64');
    const joined = lines.join('\n');
    expect(lines.length).toBeGreaterThan(0);
    expect(joined).not.toContain(base64.slice(0, 64));
    expect(joined).not.toContain(base64.slice(2000, 2064));
    const stored = await admin.from('trait_suggestions').select('*').eq('user_id', stranger.id);
    expect(JSON.stringify(stored.data)).not.toContain(base64.slice(0, 64));
  });

  it('expired suggestions are deleted on read', async () => {
    await admin.from('trait_suggestions').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('user_id', maya.id).eq('status', 'pending');
    expect(await deleteExpired(maya.id)).toBeGreaterThan(0);
    expect(await listPending(maya.id)).toEqual([]);
  });
});

describe('07 RLS', () => {
  const tables = ['import_runs', 'trait_suggestions', 'trait_provenance', 'taste_dislikes', 'import_plans'] as const;

  it('the owner reads their own rows; another user and a business owner read none', async () => {
    await admin.from('import_plans').upsert({ user_id: maya.id, cards: [] });
    for (const table of tables) {
      const own = await maya.client.from(table).select('user_id');
      expect(own.error).toBeNull();
      expect((own.data ?? []).length).toBeGreaterThan(0);
      expect((own.data ?? []).every((r) => r.user_id === maya.id)).toBe(true);
      for (const other of [stranger, owner]) {
        const res = await other.client.from(table).select('user_id').eq('user_id', maya.id);
        expect(res.data ?? []).toEqual([]);
      }
    }
  });

  it('users cannot write 07 tables or call import_decide directly', async () => {
    const insert = await maya.client.from('taste_dislikes').insert({ user_id: maya.id, label: 'x', source: 'not_me' });
    expect(insert.error).not.toBeNull();
    const rpc = await maya.client.rpc('import_decide', { p_user: maya.id, p_decisions: [], p_provenance: [], p_dislikes: [] });
    expect(rpc.error).not.toBeNull();
  });
});
