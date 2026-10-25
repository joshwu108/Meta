import { describe, expect, it } from 'vitest';
import { bandLabel, categoryLabel, slotLabel, stepStates } from '@/features/demand/components/labels';

describe('stepStates', () => {
  it('marks earlier steps done and the current one current', () => {
    expect(stepStates('matching', 'running')).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
  });

  it('shows everything done once the run completes', () => {
    expect(stepStates('drafting', 'completed')).toEqual(['done', 'done', 'done', 'done', 'done']);
  });

  it('has nothing current before a stage is known', () => {
    expect(stepStates(null, null)).toEqual(['upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  });
});

describe('labels', () => {
  it('formats cluster labels for people', () => {
    expect(categoryLabel('food_drink')).toBe('Food & drink');
    expect(slotLabel('thu_eve')).toBe('Thu evening');
    expect(bandLabel('6-9')).toBe('6–9 interested');
    expect(categoryLabel('unknown')).toBe('unknown');
  });
});
