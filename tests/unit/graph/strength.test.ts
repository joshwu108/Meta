import { describe, expect, it } from 'vitest';
import { STRENGTH, edgeStrength, strengthByUser } from '@/features/graph/server/strength';

const NOW = Date.parse('2026-10-25T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

describe('edgeStrength', () => {
  it('is the floor with nothing to go on', () => {
    expect(edgeStrength([], NOW)).toBe(STRENGTH.floor);
  });

  it('adds up what happened, and never passes 1', () => {
    const one = edgeStrength([{ weight: 0.5, createdAt: daysAgo(0) }], NOW);
    const two = edgeStrength(
      [
        { weight: 0.5, createdAt: daysAgo(0) },
        { weight: 0.2, createdAt: daysAgo(0) },
      ],
      NOW,
    );
    expect(two).toBeGreaterThan(one);
    const lots = Array.from({ length: 20 }, () => ({ weight: 1, createdAt: daysAgo(0) }));
    expect(edgeStrength(lots, NOW)).toBe(1);
  });

  it('fades with age, so an old acquaintance sits further out than a current one', () => {
    const fresh = edgeStrength([{ weight: 0.5, createdAt: daysAgo(1) }], NOW);
    const stale = edgeStrength([{ weight: 0.5, createdAt: daysAgo(180) }], NOW);
    expect(fresh).toBeGreaterThan(stale);
    expect(stale).toBeGreaterThanOrEqual(STRENGTH.floor);
  });

  it('ignores a weightless fact like a decline', () => {
    expect(edgeStrength([{ weight: 0, createdAt: daysAgo(0) }], NOW)).toBe(STRENGTH.floor);
  });
});

describe('strengthByUser', () => {
  it('groups rows by the other person, whichever side acted', () => {
    const me = 'me';
    const map = strengthByUser(
      me,
      [
        { actor_id: me, subject_id: 'a', weight: 0.5, created_at: daysAgo(0), kind: 'accepted' },
        { actor_id: 'b', subject_id: me, weight: 0.5, created_at: daysAgo(0), kind: 'accepted' },
        {
          actor_id: 'b',
          subject_id: me,
          weight: 0.2,
          created_at: daysAgo(0),
          kind: 'message_exchanged',
        },
      ],
      NOW,
    );
    expect([...map.keys()].sort()).toEqual(['a', 'b']);
    expect(map.get('b')!).toBeGreaterThan(map.get('a')!);
  });
});
