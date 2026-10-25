import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SKIP_REASON, cleanup, localStack, signedInOwner, uniqueEmail, type Stack } from './support/stack';


/**
 * Spec section 9 (integration) — the guarantees only the real database can give:
 * RLS, the status-guard trigger, and the atomicity of `decide_proposal`.
 *
 * Needs `supabase start` and a `db reset`. Skips itself when no stack is reachable.
 */

const stack = await localStack();
const suite = stack ? describe : describe.skip;

/** PostgREST answers from a schema cache, so a missing table is PGRST205, not 42P01. */
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);

/**
 * Probed before the suite is defined so a table another workstream has not merged produces
 * a visible `skipped`, not a test that returns early and reads as a pass.
 */
const hasRsvps = await (async () => {
  if (!stack) return false;
  const { error } = await stack.admin.from('rsvps').select('event_id').limit(1);
  return error === null || !MISSING_TABLE_CODES.has(error.code);
})();

if (!stack) console.warn(`[ws05] skipping integration tests: ${SKIP_REASON}`);

suite('business platform against the real database', () => {
  const live = stack as Stack;
  const created: string[] = [];

  let kiln: { userId: string; client: SupabaseClient };
  let meeple: { userId: string; client: SupabaseClient };
  let kilnId: string;
  let meepleId: string;
  let eventId: string;

  const onboard = async (
    owner: { userId: string; client: SupabaseClient },
    slug: string,
    name: string,
  ): Promise<string> => {
    const { data, error } = await owner.client
      .from('businesses')
      .insert({
        owner_id: owner.userId,
        name,
        slug,
        category: 'creative',
        address: '1 Valencia St',
        neighborhood: 'Mission',
        lat: 37.7599,
        lng: -122.4148,
        hours: { thu: [['09:00', '21:00']] },
      })
      .select('id')
      .single();
    if (error) throw new Error(`could not onboard ${slug}: ${error.message}`);

    const id = (data as { id: string }).id;
    await owner.client.from('business_capabilities').insert({
      business_id: id,
      event_categories: ['creative'],
      capacity: 12,
      min_price_cents: 1500,
      max_price_cents: 3500,
      hosting_slots: ['thu_eve'],
      equipment_tags: ['pottery-wheels'],
      formats: ['workshop'],
      accepts_ai_proposals: true,
    });
    created.push(id);
    return id;
  };

  beforeAll(async () => {
    kiln = await signedInOwner(live, uniqueEmail('kiln'));
    meeple = await signedInOwner(live, uniqueEmail('meeple'));
    await cleanup(live, created);
    kilnId = await onboard(kiln, `ws05-kiln-${Date.now()}`, 'Kiln & Cup');
    meepleId = await onboard(meeple, `ws05-meeple-${Date.now()}`, 'Meeple House');

    const { data } = await kiln.client
      .from('events')
      .insert({
        business_id: kilnId,
        source: 'business_manual',
        title: 'Open Studio Evening',
        description: 'Drop in and throw a pot.',
        category: 'creative',
        starts_at: '2026-10-29T18:00:00Z',
        ends_at: '2026-10-29T20:00:00Z',
        capacity: 10,
        price_cents: 1800,
      })
      .select('id')
      .single();
    eventId = (data as { id: string }).id;
  }, 30_000);

  afterAll(async () => {
    await cleanup(live, created);
  });

  /** T-I1 */
  it('hides one owner events from another owner', async () => {
    const mine = await kiln.client.from('events').select('id').eq('id', eventId).maybeSingle();
    expect(mine.data).not.toBeNull();

    const theirs = await meeple.client.from('events').select('id').eq('id', eventId).maybeSingle();
    expect(theirs.data).toBeNull();
  });

  it('hides one owner capabilities notes from being written by another owner', async () => {
    const { data, error } = await meeple.client
      .from('business_capabilities')
      .update({ capacity: 500 })
      .eq('business_id', kilnId)
      .select('business_id');
    const after = await live.admin
      .from('business_capabilities')
      .select('capacity')
      .eq('business_id', kilnId)
      .single();

    // RLS filters the row out rather than erroring, so the update matches nothing and the
    // stored capacity is untouched. (The previous assertion here could not fail: a
    // PostgrestError always carries a code.)
    expect((after.data as { capacity: number }).capacity).toBe(12);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  /** T-I6 */
  it('lets the public read only published, full or completed events', async () => {
    const draft = await meeple.client.from('events').select('id').eq('id', eventId).maybeSingle();
    expect(draft.data).toBeNull();

    await kiln.client.rpc('publish_event', { p_event_id: eventId });

    const published = await meeple.client.from('events').select('id, status').eq('id', eventId).maybeSingle();
    expect(published.data).toMatchObject({ status: 'published' });
  });

  /** Spec section 12: the status machine cannot be bypassed by a direct update. */
  it('rejects a direct status update from the owner session', async () => {
    const { error } = await kiln.client.from('events').update({ status: 'completed' }).eq('id', eventId);
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/status RPC/);
  });

  it('rejects an illegal transition through the RPC', async () => {
    await kiln.client.rpc('transition_event_status', { p_event_id: eventId, p_to: 'completed' });
    const { error } = await kiln.client.rpc('publish_event', { p_event_id: eventId });
    expect(error?.message).toMatch(/CONFLICT/);
  });

  it('refuses to cancel without a reason', async () => {
    const { error } = await kiln.client.rpc('cancel_event', { p_event_id: eventId, p_reason: '  ' });
    expect(error?.message).toMatch(/VALIDATION/);
  });

  it('hides another owner event behind NOT_FOUND in every RPC', async () => {
    const { error } = await meeple.client.rpc('publish_event', { p_event_id: eventId });
    expect(error?.message).toMatch(/NOT_FOUND/);
  });

  it('exposes the venue through the candidate prefilter', async () => {
    const { data, error } = await kiln.client.rpc('business_candidates', {
      p_category: 'creative',
      p_cohort_size: 6,
      p_lat: 37.7599,
      p_lng: -122.4148,
      p_radius_km: 3,
    });
    expect(error).toBeNull();
    expect((data as { business_id: string }[]).some((row) => row.business_id === kilnId)).toBe(true);
  });

  it('excludes a venue that is too small or too far', async () => {
    const tooBig = await kiln.client.rpc('business_candidates', {
      p_category: 'creative',
      p_cohort_size: 400,
      p_lat: 37.7599,
      p_lng: -122.4148,
      p_radius_km: 3,
    });
    expect(tooBig.data).toEqual([]);

    const tooFar = await kiln.client.rpc('business_candidates', {
      p_category: 'creative',
      p_cohort_size: 6,
      p_lat: 40.7128,
      p_lng: -74.006,
      p_radius_km: 3,
    });
    expect(tooFar.data).toEqual([]);
  });

  it('keeps one business per owner', async () => {
    const { error } = await kiln.client.from('businesses').insert({
      owner_id: kiln.userId,
      name: 'Second Venue',
      slug: `ws05-second-${Date.now()}`,
      category: 'creative',
      address: '2 Valencia St',
      lat: 37.76,
      lng: -122.41,
    });
    expect(error).not.toBeNull();
  });

  it('never lets a business read a user-private table', async () => {
    for (const table of ['user_preferences', 'agent_profiles', 'agent_messages', 'demand_cluster_members']) {
      const { data, error } = await kiln.client.from(table).select('*').limit(1);
      // Either the table is not merged yet, or RLS returns nothing. Never rows.
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    }
  });

  /**
   * T-I5 and the attendee list. Workstream 06 owns `rsvps` and its policy is
   * `auth.uid() = user_id`, so a venue reading its own attendees as itself sees nothing —
   * which is why 05 reads them with the service role and masks before returning. Skips
   * until 06 merges.
   */
  it.skipIf(!hasRsvps)('reads attendees only through the service role', async () => {
    const attendee = await signedInOwner(live, uniqueEmail('attendee'));
    await live.admin.from('rsvps').insert({
      event_id: eventId,
      user_id: attendee.userId,
      status: 'confirmed',
      share_with_business: true,
    });

    // The venue's own session is refused by 06's policy.
    const asOwner = await kiln.client.from('rsvps').select('user_id').eq('event_id', eventId);
    expect(asOwner.data ?? []).toEqual([]);

    // The service role sees it, which is the path 05's store uses.
    const asService = await live.admin
      .from('rsvps')
      .select('user_id, status, share_with_business')
      .eq('event_id', eventId);
    expect(asService.data).toHaveLength(1);
    expect(asService.data?.[0]).toMatchObject({ status: 'confirmed', share_with_business: true });

    // And the columns 05 selects all exist on 06's table.
    const shape = await live.admin
      .from('rsvps')
      .select('user_id, status, share_with_business, profiles(display_name)')
      .eq('event_id', eventId);
    expect(shape.error).toBeNull();
  });

  it('keeps meeple out of this suite assertions', () => {
    expect(meepleId).not.toBe(kilnId);
  });
});
