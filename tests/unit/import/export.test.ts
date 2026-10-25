import { describe, expect, it } from 'vitest';
import { extractLabels, mergeLabels } from '@/features/import/components/export-labels';
import { ExportLabelsSchema } from '@/features/import/schemas';
import { aggregate, exportToSignals, matchVocabulary } from '@/features/import/server/pipeline';

const topicsFile = {
  topics_your_topics: [
    { title: '', media_map_data: {}, string_map_data: { Name: { href: '', value: 'Ceramics', timestamp: 0 } } },
    { string_map_data: { Name: { value: 'Board games' } } },
    { string_map_data: { Name: { value: 'Weight loss' } } },
  ],
};
const adsFile = { inferred_data_ig_interest: [{ string_map_data: { Interest: { value: 'Pottery' } } }, { string_map_data: { Interest: { value: 'Ceramics' } } }] };
const messagesFile = { participants: [{ name: 'Someone' }], messages: [{ sender_name: 'Someone', content: 'secret' }] };

describe('export label extraction (runs in the Web Worker)', () => {
  it('pulls topic and ad-interest labels by shape and nothing else', () => {
    const merged = mergeLabels([extractLabels(topicsFile), extractLabels(adsFile), extractLabels(messagesFile)]);
    expect(merged).toEqual({ topics: ['Ceramics', 'Board games', 'Weight loss'], adInterests: ['Pottery', 'Ceramics'] });
    expect(JSON.stringify(merged)).not.toMatch(/secret|Someone/);
  });

  it('returns nothing for unknown shapes', () => {
    expect(extractLabels(null)).toEqual({ topics: [], adInterests: [] });
    expect(extractLabels([1, 2])).toEqual({ topics: [], adInterests: [] });
    expect(extractLabels({ topics: 'not an array' })).toEqual({ topics: [], adInterests: [] });
  });
});

describe('export → suggestions', () => {
  it('drops sensitive labels and weights ad interests below topics', () => {
    const parsed = exportToSignals(['Ceramics', 'Board games', 'Weight loss'], ['Pottery', 'Ceramics']);
    expect(parsed.droppedSensitive).toBe(1);
    const candidates = aggregate(matchVocabulary(parsed.signals).mapped, []);
    const byValue = Object.fromEntries(candidates.map((c) => [c.value, c]));
    expect(byValue.ceramics!.confidence).toBe(0.74); // 1 − 0.4 × 0.65
    expect(byValue['board-games']!.confidence).toBe(0.6);
    expect(byValue.pottery!.confidence).toBe(0.35);
    expect(byValue.pottery!.evidence[0]).toMatch(/ad interests/);
  });

  it('the request schema is strict and bounded', () => {
    expect(ExportLabelsSchema.safeParse({ topics: ['Ceramics'], adInterests: [] }).success).toBe(true);
    expect(ExportLabelsSchema.safeParse({ topics: ['Ceramics'], adInterests: [], messages: ['x'] }).success).toBe(false);
    expect(ExportLabelsSchema.safeParse({ topics: ['x'.repeat(65)], adInterests: [] }).success).toBe(false);
    expect(ExportLabelsSchema.safeParse({ topics: [], adInterests: [] }).success).toBe(false);
  });
});
