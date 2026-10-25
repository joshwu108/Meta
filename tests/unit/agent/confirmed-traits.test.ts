import { describe, expect, it } from 'vitest';
import { confirmedSources, unionTraits, withoutTraits } from '@/features/agent/server/confirmed-traits';
import { EMPTY_PREFERENCES, type UserPreferencesWithSources } from '@/features/agent/schemas';

const base = (over: Partial<UserPreferencesWithSources> = {}): UserPreferencesWithSources => ({
  ...EMPTY_PREFERENCES,
  travelRadiusKm: 5,
  fieldSources: {},
  ...over,
});

describe('addConfirmedTraits rules (07 → 02)', () => {
  it('unions normalized tags and derives categories without dropping existing values', () => {
    const next = unionTraits(base({ interests: ['pottery'], interestCategories: ['creative'] }), { interests: ['Board Games', 'pottery'], activityPrefs: ['quiet'] }, true);
    expect(next.interests).toEqual(['pottery', 'board-games']);
    expect(next.interestCategories).toEqual(['creative', 'games']);
    expect(next.activityPrefs).toEqual(['quiet']);
  });

  it('keeps ai_inferred before onboarding review and sets user_set after', () => {
    const current = { interests: 'ai_inferred', activityPrefs: 'user_set' } as const;
    expect(confirmedSources(current, ['interests', 'activityPrefs'], false)).toEqual({ interests: 'ai_inferred', activityPrefs: 'user_set' });
    expect(confirmedSources(current, ['interests'], true)).toEqual({ interests: 'user_set', activityPrefs: 'user_set' });
    expect(confirmedSources({}, ['interests'], false)).toEqual({ interests: 'user_set' });
  });

  it('leaves untouched fields alone', () => {
    const next = unionTraits(base({ fieldSources: { availabilitySlots: 'ai_inferred' } }), { activityPrefs: ['hands-on'] }, true);
    expect(next.fieldSources).toEqual({ availabilitySlots: 'ai_inferred', activityPrefs: 'user_set' });
  });

  it('refuses to go over 50 interests', () => {
    const full = base({ interests: Array.from({ length: 50 }, (_, i) => `tag-${i}`) });
    expect(() => unionTraits(full, { interests: ['ceramics'] }, true)).toThrow(/up to 50 interests/);
    expect(unionTraits(full, { interests: ['tag-3'] }, true).interests).toHaveLength(50);
  });

  it('removes imported values, keeps categories other interests still imply, and marks touched fields user_set', () => {
    const current = base({
      interests: ['pottery', 'ceramics', 'board-games'],
      interestCategories: ['creative', 'games', 'music'],
      activityPrefs: ['quiet'],
      fieldSources: { interests: 'ai_inferred' },
    });
    const next = withoutTraits(current, { interests: ['ceramics', 'board-games'] });
    expect(next.interests).toEqual(['pottery']);
    expect(next.interestCategories).toEqual(['creative', 'music']);
    expect(next.activityPrefs).toEqual(['quiet']);
    expect(next.fieldSources).toMatchObject({ interests: 'user_set', interestCategories: 'user_set' });
  });
});
