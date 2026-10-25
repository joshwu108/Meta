import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeAdmin, type FakeAdmin } from './fake-admin';

vi.mock('server-only', () => ({}));

let admin: FakeAdmin = fakeAdmin();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin.client() }));

const { normalizeGraphEvent, recordGraphEvent, recordGraphEvents } =
  await import('@/features/graph/server/provenance');

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALICE = uid(1);
const BOB = uid(2);
const CAROL = uid(3);
const REF = uid(90);

beforeEach(() => {
  admin = fakeAdmin();
});

describe('normalizeGraphEvent', () => {
  it('defaults source and weight from the kind and normalizes the pair', () => {
    const event = normalizeGraphEvent({
      actorId: BOB,
      subjectId: ALICE,
      kind: 'accepted',
      refId: REF,
    });
    expect(event).toMatchObject({
      actor_id: BOB,
      subject_id: ALICE,
      kind: 'accepted',
      source: 'user',
      ref_table: 'connections',
      ref_id: REF,
    });
    // least/greatest, so a pair reads the same whichever side acted.
    expect(event?.pairLo).toBe(ALICE);
    expect(event?.pairHi).toBe(BOB);
    expect(event?.weight).toBeGreaterThan(0);
  });

  it('marks an agent suggestion as agent-sourced and low weight', () => {
    const suggested = normalizeGraphEvent({
      actorId: ALICE,
      subjectId: BOB,
      kind: 'agent_suggested',
    });
    const accepted = normalizeGraphEvent({ actorId: ALICE, subjectId: BOB, kind: 'accepted' });
    expect(suggested?.source).toBe('agent');
    expect(suggested?.weight).toBeLessThan(accepted!.weight);
  });

  it('keeps an explicit source, ref and metadata', () => {
    const event = normalizeGraphEvent({
      actorId: ALICE,
      subjectId: BOB,
      kind: 'group_joined',
      source: 'group',
      refTable: 'groups',
      refId: REF,
      metadata: { backfilled: true },
    });
    expect(event).toMatchObject({
      source: 'group',
      ref_table: 'groups',
      metadata: { backfilled: true },
    });
  });

  it('rejects a self edge, an unknown kind and a malformed id', () => {
    expect(normalizeGraphEvent({ actorId: ALICE, subjectId: ALICE, kind: 'accepted' })).toBeNull();
    // @ts-expect-error unknown kind is rejected at runtime too
    expect(normalizeGraphEvent({ actorId: ALICE, subjectId: BOB, kind: 'befriended' })).toBeNull();
    expect(
      normalizeGraphEvent({ actorId: 'not-a-uuid', subjectId: BOB, kind: 'accepted' }),
    ).toBeNull();
  });

  it('clamps a weight outside the column range', () => {
    expect(
      normalizeGraphEvent({ actorId: ALICE, subjectId: BOB, kind: 'accepted', weight: 99 })?.weight,
    ).toBe(1);
    expect(
      normalizeGraphEvent({ actorId: ALICE, subjectId: BOB, kind: 'accepted', weight: -5 })?.weight,
    ).toBe(0);
  });
});

describe('recordGraphEvent', () => {
  it('inserts one row with the pair, kind and source', async () => {
    await recordGraphEvent({ actorId: ALICE, subjectId: BOB, kind: 'request_sent', refId: REF });
    expect(admin.inserted).toHaveLength(1);
    expect(admin.inserted[0]).toHaveLength(1);
    expect(admin.inserted[0]![0]).toMatchObject({
      actor_id: ALICE,
      subject_id: BOB,
      kind: 'request_sent',
      source: 'user',
      ref_table: 'connections',
      ref_id: REF,
    });
  });

  it('never throws when the insert fails', async () => {
    admin.failInsert = true;
    await expect(
      recordGraphEvent({ actorId: ALICE, subjectId: BOB, kind: 'accepted' }),
    ).resolves.toBeUndefined();
  });

  it('never throws when the dedupe read fails, and still records', async () => {
    admin.failSelect = true;
    await expect(
      recordGraphEvent({ actorId: ALICE, subjectId: BOB, kind: 'message_exchanged' }),
    ).resolves.toBeUndefined();
    expect(admin.inserted).toHaveLength(1);
  });

  it('drops an invalid event without touching the database', async () => {
    await recordGraphEvent({ actorId: ALICE, subjectId: ALICE, kind: 'accepted' });
    expect(admin.inserted).toEqual([]);
    expect(admin.selects).toEqual([]);
  });
});

describe('recordGraphEvents', () => {
  it('writes a batch in one insert and skips invalid members', async () => {
    await recordGraphEvents([
      { actorId: ALICE, subjectId: BOB, kind: 'agent_suggested' },
      { actorId: ALICE, subjectId: CAROL, kind: 'agent_suggested' },
      { actorId: ALICE, subjectId: ALICE, kind: 'agent_suggested' },
    ]);
    expect(admin.inserted).toHaveLength(1);
    expect(admin.inserted[0]).toHaveLength(2);
  });

  it('does nothing on an empty batch', async () => {
    await recordGraphEvents([]);
    expect(admin.selects).toEqual([]);
    expect(admin.inserted).toEqual([]);
  });

  it('skips a repeat in the same direction inside the window', async () => {
    await recordGraphEvents([{ actorId: ALICE, subjectId: BOB, kind: 'message_exchanged' }]);
    await recordGraphEvents([{ actorId: ALICE, subjectId: BOB, kind: 'message_exchanged' }]);
    expect(admin.inserted).toHaveLength(1);
  });

  it('keeps the other side of the same pair, which is its own moment', async () => {
    await recordGraphEvents([{ actorId: ALICE, subjectId: BOB, kind: 'message_exchanged' }]);
    await recordGraphEvents([{ actorId: BOB, subjectId: ALICE, kind: 'message_exchanged' }]);
    expect(admin.inserted).toHaveLength(2);
  });

  it('skips a kind already recorded for the same ref, whatever its age', async () => {
    admin.rows.push({
      actor_id: ALICE,
      subject_id: BOB,
      pair_lo: ALICE,
      pair_hi: BOB,
      kind: 'accepted',
      ref_id: REF,
      created_at: '2020-01-01T00:00:00.000Z',
    });
    await recordGraphEvents([{ actorId: BOB, subjectId: ALICE, kind: 'accepted', refId: REF }]);
    expect(admin.inserted).toEqual([]);
    // A different connection between the same pair is a new fact.
    await recordGraphEvents([{ actorId: BOB, subjectId: ALICE, kind: 'accepted', refId: uid(91) }]);
    expect(admin.inserted).toHaveLength(1);
  });

  it('collapses duplicates inside one batch, per direction', async () => {
    await recordGraphEvents([
      { actorId: ALICE, subjectId: BOB, kind: 'agent_suggested' },
      { actorId: ALICE, subjectId: BOB, kind: 'agent_suggested' },
      { actorId: BOB, subjectId: ALICE, kind: 'agent_suggested' },
    ]);
    expect(admin.inserted[0]).toHaveLength(2);
  });

  it('collapses a ref-dedupe kind whichever side reports it', async () => {
    await recordGraphEvents([
      { actorId: ALICE, subjectId: BOB, kind: 'accepted', refId: REF },
      { actorId: BOB, subjectId: ALICE, kind: 'accepted', refId: REF },
    ]);
    expect(admin.inserted[0]).toHaveLength(1);
  });

  it('reads the dedupe window only for the kinds in the batch', async () => {
    await recordGraphEvents([{ actorId: ALICE, subjectId: BOB, kind: 'agent_suggested' }]);
    expect(admin.selects).toHaveLength(1);
    expect(admin.selects[0]!.kinds).toEqual(['agent_suggested']);
    expect(admin.selects[0]!.since).not.toBeNull();
  });

  it('caps an oversized batch instead of flooding the log', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      actorId: ALICE,
      subjectId: uid(100 + i),
      kind: 'agent_suggested' as const,
    }));
    await recordGraphEvents(many);
    expect(admin.inserted[0]!.length).toBeLessThanOrEqual(25);
  });
});
