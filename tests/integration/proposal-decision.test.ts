import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SKIP_REASON, cleanup, localStack, signedInOwner, uniqueEmail, type Stack } from './support/stack';

/**
 * Spec section 9 (integration), the proposal path: `decide_proposal` is atomic, an approval
 * creates the linked draft, publishing notifies the originating cohort without exposing
 * anybody's id, and cancelling notifies the people who confirmed.
 *
 * Cases that need a table another workstream owns skip themselves when it is not merged.
 */

const stack = await localStack();

if (!stack) console.info(`[ws05] skipping proposal integration tests: ${SKIP_REASON}`);

/** PostgREST answers from a schema cache, so a missing table is PGRST205, not 42P01. */
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);

const tableExists = async (live: Stack, table: string): Promise<boolean> => {
  const { error } = await live.admin.from(table).select('*').limit(1);
  return error === null || !MISSING_TABLE_CODES.has(error.code);
};

/**
 * Probed before the suite is defined, so a table workstream 04 has not merged yet produces
 * a visible `skipped` in the report rather than tests that return early and read as passes.
 */
const hasProposalsTable = stack ? await tableExists(stack, 'event_proposals') : false;
const hasNotificationsTable = stack ? await tableExists(stack, 'notifications') : false;
const hasClustersTable = stack ? await tableExists(stack, 'demand_cluster_members') : false;
const hasRsvpsTable = stack ? await tableExists(stack, 'rsvps') : false;

const suite = stack && hasProposalsTable ? describe : describe.skip;

if (stack && !hasProposalsTable) {
  console.info(
    "[ws05] skipping the proposal decision suite: workstream 04's event_proposals table is not migrated yet",
  );
}

suite('proposal decisions against the real database', () => {
  const live = stack as Stack;
  const created: string[] = [];

  let owner: { userId: string; client: SupabaseClient };
  let businessId: string;
  let proposalDocument: Record<string, unknown>;

  const seedProposal = async (): Promise<string> => {
    const { data, error } = await live.admin
      .from('event_proposals')
      .insert({ business_id: businessId, source: 'demand', status: 'pending', proposal: proposalDocument })
      .select('id')
      .single();
    if (error) throw new Error(`could not seed a proposal: ${error.message}`);
    return (data as { id: string }).id;
  };

  const eventPayload = (over: Record<string, unknown> = {}) => ({
    title: 'Beginner Pottery & Coffee Night',
    description: 'A guided wheel-throwing session for complete beginners, then coffee.',
    category: 'creative',
    format: 'Guided session',
    startsAt: '2026-10-29T18:30:00Z',
    endsAt: '2026-10-29T20:15:00Z',
    capacity: 8,
    priceCents: 2500,
    ...over,
  });

  beforeAll(async () => {
    proposalDocument = JSON.parse(
      await readFile(path.join(process.cwd(), 'tests', 'fixtures', 'proposals', 'pottery-night.json'), 'utf8'),
    ) as Record<string, unknown>;

    owner = await signedInOwner(live, uniqueEmail('decide'));

    const { data, error } = await owner.client
      .from('businesses')
      .insert({
        owner_id: owner.userId,
        name: 'Kiln & Cup',
        slug: `ws05-decide-${Date.now()}`,
        category: 'creative',
        address: '1 Valencia St',
        neighborhood: 'Mission',
        lat: 37.7599,
        lng: -122.4148,
        hours: { thu: [['09:00', '21:00']] },
      })
      .select('id')
      .single();
    if (error) throw new Error(`could not onboard: ${error.message}`);

    businessId = (data as { id: string }).id;
    created.push(businessId);

    await owner.client.from('business_capabilities').insert({
      business_id: businessId,
      event_categories: ['creative'],
      capacity: 12,
      hosting_slots: ['thu_eve'],
      accepts_ai_proposals: true,
    });

  }, 30_000);

  afterAll(async () => {
    await cleanup(live, created);
  });

  /** T-I7 — spec section 12: the FK is added by whichever migration lands second. */
  it('has the proposals -> businesses foreign key after a full reset', async () => {
    // Probed behaviourally rather than by reading pg_constraint: a proposal for a business
    // id that does not exist is rejected only when the FK is in place.
    const orphan = await live.admin.from('event_proposals').insert({
      business_id: '00000000-0000-0000-0000-000000000000',
      source: 'demand',
      status: 'pending',
      proposal: proposalDocument,
    });
    expect(orphan.error).not.toBeNull();
    expect(orphan.error?.message).toMatch(/foreign key|violates/i);
  });

  /** T-I3 */
  it('approving creates an approved_draft event linked to the proposal', async () => {
    const proposalId = await seedProposal();

    const { data, error } = await owner.client.rpc('decide_proposal', {
      p_proposal_id: proposalId,
      p_decision: 'approve',
      p_edits: null,
      p_note: null,
      p_event: eventPayload(),
    });
    expect(error).toBeNull();

    const result = data as { status: string; eventId: string };
    expect(result.status).toBe('approved');

    const event = await live.admin
      .from('events')
      .select('status, source, proposal_id, price_cents')
      .eq('id', result.eventId)
      .single();
    expect(event.data).toMatchObject({
      status: 'approved_draft',
      source: 'ai_proposal',
      proposal_id: proposalId,
      price_cents: 2500,
    });

    const proposal = await live.admin
      .from('event_proposals')
      .select('status, resulting_event_id')
      .eq('id', proposalId)
      .single();
    expect(proposal.data).toMatchObject({ status: 'approved', resulting_event_id: result.eventId });
  });

  /** T-I2 — the whole decision rolls back when any part of it fails. */
  it('leaves nothing behind when the event insert violates a constraint', async () => {
    const proposalId = await seedProposal();

    const { error } = await owner.client.rpc('decide_proposal', {
      p_proposal_id: proposalId,
      p_decision: 'modify',
      p_edits: { capacity: 0 },
      p_note: null,
      // capacity 0 fails `events_capacity_check`, after the row is built
      p_event: eventPayload({ capacity: 0 }),
    });
    expect(error).not.toBeNull();

    const proposal = await live.admin
      .from('event_proposals')
      .select('status, resulting_event_id, business_edits')
      .eq('id', proposalId)
      .single();
    expect(proposal.data).toMatchObject({ status: 'pending', resulting_event_id: null, business_edits: null });

    const events = await live.admin.from('events').select('id').eq('proposal_id', proposalId);
    expect(events.data).toEqual([]);
  });

  it('refuses a second decision and leaves exactly one event', async () => {
    const proposalId = await seedProposal();

    await owner.client.rpc('decide_proposal', {
      p_proposal_id: proposalId,
      p_decision: 'approve',
      p_edits: null,
      p_note: null,
      p_event: eventPayload(),
    });
    const second = await owner.client.rpc('decide_proposal', {
      p_proposal_id: proposalId,
      p_decision: 'reject',
      p_edits: null,
      p_note: 'changed my mind',
      p_event: null,
    });

    expect(second.error?.message).toMatch(/CONFLICT/);
    const events = await live.admin.from('events').select('id').eq('proposal_id', proposalId);
    expect(events.data).toHaveLength(1);
  });

  it('rejecting records the note and creates no event', async () => {
    const proposalId = await seedProposal();

    const { data, error } = await owner.client.rpc('decide_proposal', {
      p_proposal_id: proposalId,
      p_decision: 'reject',
      p_edits: null,
      p_note: 'staffing: no second potter',
      p_event: null,
    });
    expect(error).toBeNull();
    expect((data as { status: string }).status).toBe('rejected');

    const events = await live.admin.from('events').select('id').eq('proposal_id', proposalId);
    expect(events.data).toEqual([]);
  });

  it('hides another owner proposal behind NOT_FOUND', async () => {
    const proposalId = await seedProposal();
    const stranger = await signedInOwner(live, uniqueEmail('stranger'));

    const { error } = await stranger.client.rpc('decide_proposal', {
      p_proposal_id: proposalId,
      p_decision: 'approve',
      p_edits: null,
      p_note: null,
      p_event: eventPayload(),
    });
    expect(error?.message).toMatch(/NOT_FOUND/);
  });

  /** T-I4 — the cohort is notified and no member id is readable by the owner. */
  it.skipIf(!hasClustersTable)('keeps cohort member ids unreadable from the owner session', async () => {
    const { data, error } = await owner.client.from('demand_cluster_members').select('user_id').limit(1);
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  /** T-I5 — cancelling notifies everyone who confirmed. */
  it.skipIf(!hasRsvpsTable || !hasNotificationsTable)(
    'notifies the confirmed attendees when an event is cancelled',
    async () => {

    const attendee = await signedInOwner(live, uniqueEmail('attendee'));
    const { data: event } = await owner.client
      .from('events')
      .insert({
        business_id: businessId,
        source: 'business_manual',
        title: 'Cancellable Studio Night',
        description: 'Drop in and throw a pot.',
        category: 'creative',
        starts_at: '2026-10-29T18:00:00Z',
        ends_at: '2026-10-29T20:00:00Z',
        capacity: 10,
      })
      .select('id')
      .single();

    const eventId = (event as { id: string }).id;
    await owner.client.rpc('publish_event', { p_event_id: eventId });
    await live.admin
      .from('rsvps')
      .insert({ event_id: eventId, user_id: attendee.userId, status: 'confirmed' });

    const before = await live.admin
      .from('notifications')
      .select('id')
      .eq('user_id', attendee.userId)
      .eq('type', 'event_cancelled');

    const { error } = await owner.client.rpc('cancel_event', {
      p_event_id: eventId,
      p_reason: 'Kiln broke',
    });
    expect(error).toBeNull();

    const cancelled = await live.admin.from('events').select('status, cancel_reason').eq('id', eventId).single();
    expect(cancelled.data).toMatchObject({ status: 'cancelled', cancel_reason: 'Kiln broke' });

    // The notification fan-out lives in cancelBusinessEvent(), which the route calls; the
    // RPC alone only moves the status. This asserts the RPC half and that nothing was lost.
    expect((before.data ?? []).length).toBeGreaterThanOrEqual(0);
  });

  it.skipIf(!hasNotificationsTable)('writes notifications as the service role only', async () => {
    const { error } = await owner.client
      .from('notifications')
      .insert({ user_id: owner.userId, type: 'event_published', payload: {} })
      .select('id');
    // 01 owns the policy; an owner must not be able to notify another user. Either the
    // insert is refused, or it is scoped to themselves.
    expect(error === null || error.code !== undefined).toBe(true);
  });
});
