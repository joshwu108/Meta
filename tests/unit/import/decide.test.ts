import { describe, expect, it } from 'vitest';
import { planDecisions } from '@/features/import/server/decide';

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const row = (n: number, field: string, value: string, label = value, status = 'pending') =>
  ({ id: id(n), field, value, label, status }) as never;

const rows = [
  row(1, 'interests', 'ceramics', 'Ceramics'),
  row(2, 'interests', 'board-games', 'Board games'),
  row(3, 'interests', 'hiking', 'Hiking'),
  row(4, 'dislike', 'horror-movies', 'Horror movies'),
  row(5, 'activity_prefs', 'quiet', 'Quiet'),
  row(6, 'interests', 'coffee', 'Coffee'),
  row(7, 'dislike', 'golf', 'Golf'),
];

describe('planDecisions', () => {
  it('turns Scene 1b taps into decisions, provenance, dislikes and additions', () => {
    const plan = planDecisions(rows, {
      decisions: [
        { id: id(1), action: 'love' },
        { id: id(2), action: 'yes' },
        { id: id(3), action: 'not_me' },
        { id: id(4), action: 'keep_dislike' },
        { id: id(6), action: 'edit', value: 'Pour Over Coffee' },
        { id: id(7), action: 'ignore' },
      ],
    });
    expect(plan.add).toEqual({ interests: ['ceramics', 'board-games', 'pour-over-coffee'], activityPrefs: [] });
    expect(plan.provenance).toEqual([
      { field: 'interests', value: 'ceramics', origin: 'import_accepted', strength: 'love', suggestion_id: id(1) },
      { field: 'interests', value: 'board-games', origin: 'import_accepted', strength: 'yes', suggestion_id: id(2) },
      { field: 'interests', value: 'pour-over-coffee', origin: 'import_edited', strength: 'yes', suggestion_id: id(6) },
    ]);
    expect(plan.dislikes).toEqual([
      { label: 'hiking', tag: 'hiking', source: 'not_me' },
      { label: 'horror-movies', tag: null, source: 'see_less' },
    ]);
    expect(plan.decisions.map((d) => d.status)).toEqual(['accepted', 'accepted', 'rejected', 'accepted', 'edited', 'rejected']);
  });

  it('adds activity styles to activityPrefs', () => {
    expect(planDecisions(rows, { decisions: [{ id: id(5), action: 'yes' }] }).add).toEqual({ interests: [], activityPrefs: ['quiet'] });
  });

  it('rejects actions that do not fit the card, decided or unknown ids, and repeats', () => {
    expect(() => planDecisions(rows, { decisions: [{ id: id(4), action: 'love' }] })).toThrow(/does not apply/);
    expect(() => planDecisions(rows, { decisions: [{ id: id(1), action: 'keep_dislike' }] })).toThrow(/does not apply/);
    expect(() => planDecisions([row(1, 'interests', 'ceramics', 'Ceramics', 'accepted')], { decisions: [{ id: id(1), action: 'yes' }] })).toThrow(
      expect.objectContaining({ code: 'CONFLICT' }),
    );
    expect(() => planDecisions(rows, { decisions: [{ id: id(9), action: 'yes' }] })).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    expect(() => planDecisions(rows, { decisions: [{ id: id(1), action: 'yes' }, { id: id(1), action: 'love' }] })).toThrow(/once per request/);
  });

  it('requires a usable value for Edit', () => {
    expect(() => planDecisions(rows, { decisions: [{ id: id(1), action: 'edit', value: '!!!' }] })).toThrow(/40 characters/);
    expect(() => planDecisions(rows, { decisions: [{ id: id(1), action: 'edit' }] })).toThrow(/40 characters/);
  });
});
