import { describe, expect, it } from 'vitest';
import { bandOf, confidenceOf, evidenceWeight } from '@/features/import/server/confidence';
import {
  aggregate,
  dedupe,
  dislikeCandidates,
  matchVocabulary,
  screensToSignals,
  summaryMentions,
  validateMappings,
  type Existing,
} from '@/features/import/server/pipeline';
import { isSensitive } from '@/features/import/server/sensitive';
import { ACTIVITY_STYLE_TAGS, INTEREST_TAGS, lookupLabel } from '@/features/import/server/vocabulary';
import fixture from '@/lib/ai/fixtures/import.read_screens.json';
import mapFixture from '@/lib/ai/fixtures/import.map_labels.json';
import { MapLabelsOutputSchema, ReadScreensOutputSchema } from '@/features/import/schemas';

const none: Existing = { interests: [], activityPrefs: [], pending: new Set(), dislikes: new Set() };

describe('vocabulary', () => {
  it('maps labels and aliases onto canonical tags with categories', () => {
    expect(lookupLabel('Ceramics')).toMatchObject({ tag: 'ceramics', category: 'creative', field: 'interests' });
    expect(lookupLabel('Board Games')).toMatchObject({ tag: 'board-games', category: 'games' });
    expect(lookupLabel('Wheel throwing')).toMatchObject({ tag: 'pottery' });
    expect(lookupLabel('Latte art')).toMatchObject({ tag: 'latte-art', category: 'food_drink' });
    expect(lookupLabel('Beginner friendly')).toMatchObject({ tag: 'beginner-friendly', field: 'activity_prefs' });
    expect(lookupLabel('Underwater basket weaving')).toBeNull();
  });

  it('covers every interest tag the seed fixtures use and the 8 activity styles', () => {
    for (const tag of ['pottery', 'ceramics', 'coffee', 'board-games', 'hiking', 'live-music', 'painting', 'trivia', 'zines']) {
      expect(INTEREST_TAGS).toContain(tag);
    }
    expect(INTEREST_TAGS.length).toBeGreaterThanOrEqual(130);
    expect(ACTIVITY_STYLE_TAGS).toEqual(['beginner-friendly', 'hands-on', 'quiet', 'lively', 'outdoors', 'active', 'competitive', 'learning-focused']);
  });

  it('holds no sensitive tag', () => {
    expect([...INTEREST_TAGS, ...ACTIVITY_STYLE_TAGS].filter(isSensitive)).toEqual([]);
  });
});

describe('sensitive filter', () => {
  it.each([
    'Weight loss tips', 'Mental health', 'Wellness supplements', 'Dating advice', 'LGBTQ+ creators', 'Church events',
    'Astrology', 'Election news', 'Crypto trading', 'Sports betting', 'Natural wine', 'Craft beer', 'Cannabis',
    'Vaping', 'True crime', 'Gun reviews', 'Parenting hacks', 'Baby names', 'Asian food',
  ])('blocks %s', (label) => expect(isSensitive(label)).toBe(true));

  it.each(['Ceramics', 'Board games', 'Latte art', 'Hiking', 'Espresso bar', 'Trivia night', 'Jazz', 'Yoga', 'Dance'])(
    'allows %s',
    (label) => expect(isSensitive(label)).toBe(false),
  );
});

describe('confidence', () => {
  it('weights each kind of evidence', () => {
    expect(evidenceWeight({ kind: 'topic', label: 'x', state: 'listed', close: false })).toBe(0.6);
    expect(evidenceWeight({ kind: 'topic', label: 'x', state: 'see_more', close: true })).toBeCloseTo(0.48);
    expect(evidenceWeight({ kind: 'summary', label: 'x' })).toBe(0.3);
    expect(evidenceWeight({ kind: 'explore', label: 'x', tiles: 2, close: false })).toBeCloseTo(0.3);
    expect(evidenceWeight({ kind: 'explore', label: 'x', tiles: 9, close: false })).toBe(0.45);
  });

  it('combines with 1 − Π(1 − w) and caps at 0.95 (golden values)', () => {
    expect(confidenceOf([{ kind: 'topic', label: 'x', state: 'listed', close: false }])).toBe(0.6);
    expect(confidenceOf([{ kind: 'topic', label: 'x', state: 'listed', close: false }, { kind: 'summary', label: 'x' }])).toBe(0.72);
    expect(confidenceOf([{ kind: 'explore', label: 'x', tiles: 3, close: false }])).toBe(0.45);
    const many = Array.from({ length: 6 }, () => ({ kind: 'topic' as const, label: 'x', state: 'listed' as const, close: false }));
    expect(confidenceOf(many)).toBe(0.95);
  });

  it('bands at the edges', () => {
    expect(bandOf(0.7)).toBe('strong');
    expect(bandOf(0.69)).toBe('some');
    expect(bandOf(0.5)).toBe('some');
    expect(bandOf(0.49)).toBe('weak');
    expect(bandOf(0.3)).toBe('weak');
    expect(bandOf(0.29)).toBeNull();
  });
});

describe('screens → suggestions on the demo fixture', () => {
  const read = ReadScreensOutputSchema.parse(fixture);
  const parsed = screensToSignals(read);

  it('drops sensitive topics before matching and collects see-less ones', () => {
    expect(parsed.droppedSensitive).toBeGreaterThanOrEqual(1);
    expect(parsed.signals.map((s) => s.label)).not.toContain('Wellness supplements');
    expect(parsed.seeLess).toEqual(['Horror movies']);
  });

  it('matches vocabulary first and leaves the rest for the model', () => {
    const { mapped, leftovers } = matchVocabulary(parsed.signals);
    expect(mapped.map((m) => m.entry.tag)).toEqual(expect.arrayContaining(['ceramics', 'pottery', 'board-games', 'hiking', 'latte-art']));
    expect(leftovers.some((s) => /ignore/i.test(s.label))).toBe(true);
  });

  it('the injection label yields nothing off-list, and unknown ids are dropped', () => {
    const { leftovers } = matchVocabulary(parsed.signals);
    const mapping = MapLabelsOutputSchema.parse({
      mappings: [
        ...MapLabelsOutputSchema.parse(mapFixture).mappings,
        { id: leftovers.find((s) => /ignore/i.test(s.label))!.id, field: 'interests', value: 'admin-access', quality: 'exact' },
        { id: 's999', field: 'interests', value: 'coffee', quality: 'exact' },
        { id: leftovers[0]!.id, field: 'interests', value: 'natural-wine', quality: 'exact' },
      ],
    });
    const valid = validateMappings(mapping, leftovers);
    expect(valid.every((m) => !['admin-access', 'natural-wine'].includes(m.entry.tag))).toBe(true);
    expect(valid.every((m) => leftovers.some((s) => s.id === m.signal.id))).toBe(true);
  });

  it('aggregates into banded candidates with evidence; summary lifts ceramics to strong', () => {
    const { mapped, leftovers } = matchVocabulary(parsed.signals);
    const all = [...mapped, ...validateMappings(MapLabelsOutputSchema.parse(mapFixture), leftovers)];
    const candidates = aggregate(all, summaryMentions(parsed.summaries));
    const ceramics = candidates.find((c) => c.value === 'ceramics')!;
    expect(ceramics).toMatchObject({ band: 'strong', category: 'creative', label: 'Ceramics' });
    expect(ceramics.evidence.length).toBeGreaterThanOrEqual(2);
    expect(candidates.find((c) => c.value === 'board-games')?.band).toBe('some');
    expect(candidates.every((c) => c.evidence.length >= 1 && c.evidence.length <= 3)).toBe(true);
    expect(candidates.some((c) => isSensitive(c.value))).toBe(false);
  });
});

describe('dedupe', () => {
  const candidate = (field: 'interests' | 'activity_prefs', value: string) => ({
    field, value, label: value, category: null, confidence: 0.6, band: 'some' as const, evidence: ['x'], usedModel: false,
  });

  it('drops what the profile has, what is pending and what the user rejected', () => {
    const existing: Existing = {
      interests: ['pottery'],
      activityPrefs: ['quiet'],
      pending: new Set(['interests:coffee']),
      dislikes: new Set(['hiking']),
    };
    const { kept, duplicate } = dedupe(
      [candidate('interests', 'pottery'), candidate('activity_prefs', 'quiet'), candidate('interests', 'coffee'), candidate('interests', 'hiking'), candidate('interests', 'ceramics')],
      existing,
    );
    expect(kept.map((c) => c.value)).toEqual(['ceramics']);
    expect(duplicate).toBe(4);
  });

  it('caps a run at 25', () => {
    const many = Array.from({ length: 40 }, (_, i) => candidate('interests', `tag-${i}`));
    expect(dedupe(many, none).kept).toHaveLength(25);
  });

  it('makes one dislike card per see-less topic unless already kept', () => {
    const cards = dislikeCandidates(['Horror movies', 'horror movies', 'Hiking'], { ...none, dislikes: new Set(['hiking']) });
    expect(cards).toEqual([{ value: 'horror-movies', label: 'Horror movies', tag: null, category: null }]);
  });
});
