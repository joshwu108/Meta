import { describe, expect, it, vi } from 'vitest';
import type { PostgrestError } from '@supabase/supabase-js';
import { createSupabaseStore, toApiError } from '@/features/business/server/store-supabase';
import { UNDEFINED_TABLE_ERROR, fakeSupabase, type FakeCall, type FakeResult } from '../../support/fake-supabase';

const error = (over: Partial<PostgrestError>): PostgrestError =>
  ({ message: 'boom', details: '', hint: '', code: 'XX000', ...over }) as PostgrestError;

const storeWith = (responder: (call: FakeCall) => FakeResult) => {
  const db = fakeSupabase(responder);
  const admin = fakeSupabase(responder);
  return {
    store: createSupabaseStore(db.client, () => admin.client),
    dbCalls: db.calls,
    adminCalls: admin.calls,
  };
};

describe('RPC error mapping', () => {
  it('maps the envelope prefix the RPCs raise', () => {
    expect(toApiError(error({ message: 'CONFLICT: proposal was already approved' }), 'fallback').code).toBe(
      'CONFLICT',
    );
    expect(toApiError(error({ message: 'NOT_FOUND: event does not exist' }), 'fallback').code).toBe('NOT_FOUND');
    expect(toApiError(error({ message: 'VALIDATION: a reason is required' }), 'fallback').message).toBe(
      'a reason is required',
    );
  });

  it('hides an unexpected database message behind INTERNAL', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mapped = toApiError(error({ message: 'duplicate key value violates unique constraint' }), 'fallback');
    expect(mapped.code).toBe('INTERNAL');
    expect(mapped.message).toBe('fallback');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not treat a stray colon as an error code', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(toApiError(error({ message: 'something: went wrong' }), 'fallback').code).toBe('INTERNAL');
    spy.mockRestore();
  });
});

describe('businesses', () => {
  it('reads a business by owner', async () => {
    const row = { id: 'biz-1', owner_id: 'owner-1' };
    const { store, dbCalls } = storeWith(() => ({ data: row }));
    expect(await store.findBusinessByOwner('owner-1')).toEqual(row);
    expect(dbCalls.some((c) => c.table === 'businesses' && c.op === 'eq' && c.args[0] === 'owner_id')).toBe(true);
  });

  it('returns null when the owner has no business', async () => {
    const { store } = storeWith(() => ({ data: null }));
    expect(await store.findBusinessByOwner('owner-1')).toBeNull();
  });

  it('surfaces a read failure as an ApiError', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store } = storeWith(() => ({ error: error({}) }));
    await expect(store.findBusinessByOwner('owner-1')).rejects.toMatchObject({ code: 'INTERNAL' });
    spy.mockRestore();
  });

  it('deletes the business again when the capabilities insert fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, dbCalls } = storeWith((call) =>
      call.table === 'business_capabilities' ? { error: error({}) } : { data: { id: 'biz-1' } },
    );

    await expect(
      store.createBusiness(
        {
          owner_id: 'owner-1',
          name: 'Kiln & Cup',
          slug: 'kiln-cup',
          description: null,
          category: 'creative',
          address: '1 Valencia St',
          neighborhood: 'Mission',
          lat: 37.76,
          lng: -122.41,
          image_url: null,
          hours: {},
          is_active: true,
        },
        {
          event_categories: ['creative'],
          capacity: 12,
          min_price_cents: null,
          max_price_cents: null,
          hosting_slots: ['thu_eve'],
          equipment_tags: [],
          formats: [],
          notes: null,
          accepts_ai_proposals: true,
        },
      ),
    ).rejects.toMatchObject({ code: 'INTERNAL' });

    expect(dbCalls.some((c) => c.table === 'businesses' && c.op === 'delete')).toBe(true);
    spy.mockRestore();
  });

  it('reports whether a slug is taken', async () => {
    const taken = storeWith(() => ({ data: { id: 'biz-1' } }));
    const free = storeWith(() => ({ data: null }));
    expect(await taken.store.slugExists('kiln-cup')).toBe(true);
    expect(await free.store.slugExists('kiln-cup')).toBe(false);
  });
});

describe('events', () => {
  it('publishes through the RPC, not an update', async () => {
    const { store, dbCalls } = storeWith(() => ({}));
    await store.publishEvent('evt-1');
    expect(dbCalls).toEqual([{ rpc: 'publish_event', op: 'rpc', args: [{ p_event_id: 'evt-1' }] }]);
  });

  it('cancels through the RPC with the reason', async () => {
    const { store, dbCalls } = storeWith(() => ({}));
    await store.cancelEvent('evt-1', 'Kiln broke');
    expect(dbCalls[0]?.args[0]).toEqual({ p_event_id: 'evt-1', p_reason: 'Kiln broke' });
  });

  it('maps a rejected transition to CONFLICT', async () => {
    const { store } = storeWith(() => ({
      error: error({ message: 'CONFLICT: completed -> published is not a legal event transition' }),
    }));
    await expect(store.publishEvent('evt-1')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('orders the event list by start time descending', async () => {
    const { store, dbCalls } = storeWith(() => ({ data: [] }));
    await store.listEventsForBusiness('biz-1');
    expect(dbCalls.some((c) => c.op === 'order' && c.args[0] === 'starts_at')).toBe(true);
  });
});

describe('proposals', () => {
  it('passes the decision straight to the atomic RPC', async () => {
    const { store, dbCalls } = storeWith(() => ({
      data: { proposalId: 'prop-1', status: 'approved', eventId: 'evt-1' },
    }));

    const result = await store.decideProposal({
      proposalId: 'prop-1',
      decision: 'approve',
      edits: null,
      note: null,
      event: null,
    });

    expect(result.eventId).toBe('evt-1');
    expect(dbCalls[0]?.rpc).toBe('decide_proposal');
  });

  it('returns an empty inbox while workstream 04 is unmerged', async () => {
    const { store } = storeWith(() => ({ error: UNDEFINED_TABLE_ERROR }));
    expect(await store.listProposals('biz-1', 'pending')).toEqual([]);
    expect(await store.findProposal('prop-1')).toBeNull();
  });

  it('filters by status only when one is given', async () => {
    const withStatus = storeWith(() => ({ data: [] }));
    await withStatus.store.listProposals('biz-1', 'pending');
    expect(withStatus.dbCalls.filter((c) => c.op === 'eq')).toHaveLength(2);

    const withoutStatus = storeWith(() => ({ data: [] }));
    await withoutStatus.store.listProposals('biz-1');
    expect(withoutStatus.dbCalls.filter((c) => c.op === 'eq')).toHaveLength(1);
  });
});

describe('rsvps belong to workstream 06', () => {
  /**
   * Privacy invariant 1 in specs/README.md section 3: a business never reads `profiles`,
   * and 06's RLS scopes `rsvps` to each attendee, so an owner session would read zero rows.
   * 05 therefore reads both with the service role and masks the result before returning it.
   */
  it('reads rsvps and profiles with the service role, never as the owner', async () => {
    const { store, dbCalls, adminCalls } = storeWith(() => ({ data: [], count: 0 }));

    await store.listRsvps('evt-1');
    await store.countConfirmed('evt-1');
    await store.confirmedRsvpUserIds('evt-1');

    expect(adminCalls.filter((c) => c.table === 'rsvps').length).toBeGreaterThan(0);
    expect(dbCalls.filter((c) => c.table === 'rsvps')).toEqual([]);
    expect(dbCalls.filter((c) => c.table === 'profiles')).toEqual([]);
  });

  it('reads an empty list and a zero count until the table exists', async () => {
    const { store } = storeWith(() => ({ error: UNDEFINED_TABLE_ERROR }));
    expect(await store.listRsvps('evt-1')).toEqual([]);
    expect(await store.countConfirmed('evt-1')).toBe(0);
    expect(await store.confirmedRsvpUserIds('evt-1')).toEqual([]);
  });

  it('flattens the joined profile whether it arrives as an object or an array', async () => {
    const { store } = storeWith(() => ({
      data: [
        { user_id: 'user-a', status: 'confirmed', share_with_business: true, profiles: { display_name: 'Ada' } },
        { user_id: 'user-b', status: 'confirmed', share_with_business: null, profiles: [{ display_name: 'Grace' }] },
        { user_id: 'user-c', status: 'waitlisted', share_with_business: true, profiles: null },
      ],
    }));

    expect(await store.listRsvps('evt-1')).toEqual([
      { status: 'confirmed', share_with_business: true, display_name: 'Ada' },
      { status: 'confirmed', share_with_business: false, display_name: 'Grace' },
      { status: 'waitlisted', share_with_business: true, display_name: null },
    ]);
    expect(await store.confirmedRsvpUserIds('evt-1')).toEqual(['user-a', 'user-b']);
  });

  it('counts with a head request so no row is transferred', async () => {
    const { store, adminCalls } = storeWith(() => ({ count: 3 }));
    expect(await store.countConfirmed('evt-1')).toBe(3);
    const select = adminCalls.find((c) => c.op === 'select');
    expect(select?.args[1]).toEqual({ count: 'exact', head: true });
  });
});

describe('a missing service-role key degrades instead of failing', () => {
  /**
   * `supabaseAdmin()` throws when SUPABASE_SERVICE_ROLE_KEY is unset. An attendee count is
   * not worth a 500 on the dashboard, so every service-role read falls back to its empty
   * value and says so in the log.
   */
  const storeWithoutAdmin = () => {
    const db = fakeSupabase(() => ({ data: [], count: 0 }));
    return createSupabaseStore(db.client, () => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    });
  };

  it('reports no attendees rather than throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = storeWithoutAdmin();

    expect(await store.listRsvps('evt-1')).toEqual([]);
    expect(await store.countConfirmed('evt-1')).toBe(0);
    expect(await store.confirmedRsvpUserIds('evt-1')).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reports no cohort and no insights rather than throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = storeWithoutAdmin();

    expect(await store.clusterMemberIds('cluster-1')).toEqual([]);
    expect(await store.insightClusters({ lat: 0, lng: 0, radiusKm: 3, sinceDays: 30 })).toEqual([]);
    expect(await store.countRepeatAttendees('biz-1')).toBe(0);
    warn.mockRestore();
  });
});

describe('service-role reads', () => {
  it('reads cohort member ids with the admin client', async () => {
    const { store, adminCalls, dbCalls } = storeWith(() => ({ data: [{ user_id: 'user-a' }] }));
    expect(await store.clusterMemberIds('cluster-1')).toEqual(['user-a']);
    expect(adminCalls.some((c) => c.table === 'demand_cluster_members')).toBe(true);
    expect(dbCalls).toHaveLength(0);
  });

  it('returns no cohort while workstream 04 is unmerged', async () => {
    const { store } = storeWith(() => ({ error: UNDEFINED_TABLE_ERROR }));
    expect(await store.clusterMemberIds('cluster-1')).toEqual([]);
    expect(await store.insightClusters({ lat: 0, lng: 0, radiusKm: 3, sinceDays: 30 })).toEqual([]);
  });

  it('keeps only clusters inside the radius box and drops their coordinates', async () => {
    const { store } = storeWith(() => ({
      data: [
        { category: 'creative', slot: 'thu_eve', member_count: 6, center_lat: 37.76, center_lng: -122.42 },
        { category: 'games', slot: 'fri_eve', member_count: 9, center_lat: 40.0, center_lng: -122.42 },
      ],
    }));

    const rows = await store.insightClusters({ lat: 37.76, lng: -122.42, radiusKm: 3, sinceDays: 30 });
    expect(rows).toEqual([{ category: 'creative', slot: 'thu_eve', member_count: 6 }]);
  });

  it('asks the venue search RPC for the prefilter', async () => {
    const { store, dbCalls } = storeWith(() => ({ data: [] }));
    await store.candidateRows({ category: 'creative', cohortSize: 6, lat: 37.76, lng: -122.42, radiusKm: 3 });
    expect(dbCalls[0]).toEqual({
      rpc: 'business_candidates',
      op: 'rpc',
      args: [{ p_category: 'creative', p_cohort_size: 6, p_lat: 37.76, p_lng: -122.42, p_radius_km: 3 }],
    });
  });
});

describe('repeat attendees', () => {
  it('counts a person who confirmed for two events once, and returns no ids', async () => {
    const { store, adminCalls } = storeWith((call) =>
      call.table === 'events'
        ? { data: [{ id: 'evt-1' }, { id: 'evt-2' }] }
        : {
            data: [
              { user_id: 'user-a' },
              { user_id: 'user-a' },
              { user_id: 'user-b' },
            ],
          },
    );

    expect(await store.countRepeatAttendees('biz-1')).toBe(1);
    expect(adminCalls.some((c) => c.table === 'rsvps' && c.op === 'in')).toBe(true);
  });

  it('short-circuits when the venue has no events at all', async () => {
    const { store, adminCalls } = storeWith(() => ({ data: [] }));
    expect(await store.countRepeatAttendees('biz-1')).toBe(0);
    expect(adminCalls).toHaveLength(0);
  });

  it('returns zero while workstream 06 has not merged rsvps', async () => {
    const { store } = storeWith((call) =>
      call.table === 'events' ? { data: [{ id: 'evt-1' }] } : { error: UNDEFINED_TABLE_ERROR },
    );
    expect(await store.countRepeatAttendees('biz-1')).toBe(0);
  });

  it('surfaces a failure reading the events', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store } = storeWith((call) => (call.table === 'events' ? { error: error({}) } : {}));
    await expect(store.countRepeatAttendees('biz-1')).rejects.toMatchObject({ code: 'INTERNAL' });
    spy.mockRestore();
  });
});
