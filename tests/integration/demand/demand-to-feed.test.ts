import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The loop the product is built on, end to end in one test: demand people expressed becomes a
 * cluster, the cluster becomes a proposal, a venue approves and publishes it, and the event comes
 * back to one of the very people whose demand produced it.
 *
 * Each hop has its own suite. Nothing checked that the chain joins up — which is the claim on the
 * front of the README, and the one that breaks quietly when two workstreams each stay correct.
 */

vi.mock('server-only', () => ({}));
process.env.MOCK_AI = '1';
vi.mock('@/lib/supabase/server', async () => {
  const support = await import('../social/support');
  return { createServerClient: async () => support.session.client };
});

const { adminClient, cleanupTestUsers } = await import('../helpers');
const { actAs, call } = await import('../social/support');
const { applyTestSchema, onlyTheseVenues, sceneDeps, seedScene3 } = await import('./scene3');
const { supabaseDeps } = await import('@/features/demand/server/wiring');
const { runPipeline } = await import('@/features/demand/server/pipeline');
const { getRecommendedEvents } = await import('@/features/events/server/recommended');
const { PATCH: decideProposal } = await import('@/app/api/business/proposals/[id]/route');
const { POST: publishEvent } = await import('@/app/api/business/events/[id]/publish/route');

const db = (client: unknown) => client as SupabaseClient;
const admin = adminClient() as unknown as SupabaseClient;

type World = Awaited<ReturnType<typeof seedScene3>>;
let world: World;
let restoreVenues: (() => Promise<void>) | undefined;

let proposalId: string;
let clusterId: string;
let businessId: string;
let eventId: string;
/** Someone whose own preferences went into the cluster behind the proposal. */
let askedForIt: string;

async function clearDemand(): Promise<void> {
  await admin.from('event_proposals').delete().not('id', 'is', null);
  await admin.from('opportunity_runs').delete().not('id', 'is', null);
}

beforeAll(async () => {
  applyTestSchema();
  await cleanupTestUsers(admin as never);
  await clearDemand();
  world = await seedScene3(admin);
  restoreVenues = await onlyTheseVenues(admin, [...world.owners.values()].map((o) => o.businessId));
  await runPipeline(sceneDeps(supabaseDeps(admin), world), { triggeredBy: 'manual' });

  const { data: proposals } = await admin
    .from('event_proposals')
    .select('id, business_id, cluster_id')
    .eq('status', 'pending')
    .limit(1);
  const proposal = (proposals ?? [])[0] as { id: string; business_id: string; cluster_id: string } | undefined;
  if (!proposal) throw new Error('the pipeline produced no proposal to decide');
  ({ id: proposalId, business_id: businessId, cluster_id: clusterId } = proposal);

  // The cluster members are service-role only; this is the audit reaching behind the curtain to
  // find a real member, which is the whole point of the assertion at the end.
  const { data: members } = await admin
    .from('demand_cluster_members')
    .select('user_id')
    .eq('cluster_id', clusterId)
    .limit(1);
  askedForIt = ((members ?? [])[0] as { user_id: string }).user_id;

  // Recommendations are consent-gated separately from demand, so this member opts into both.
  const { error } = await admin
    .from('agent_profiles')
    .update({
      consent: {
        allow_matching: true,
        allow_demand_aggregation: true,
        allow_group_planning: false,
        share_interests_with_attendees: false,
        share_name_with_business: false,
      },
    })
    .eq('user_id', askedForIt);
  if (error) throw new Error(error.message);
}, 180_000);

afterAll(async () => {
  await restoreVenues?.();
  await clearDemand();
  await cleanupTestUsers(admin as never);
});

describe('from demand to a seat at the event', () => {
  it('turned what people asked for into a proposal for a venue that can host it', () => {
    expect(proposalId).toBeTruthy();
    expect(clusterId).toBeTruthy();
    expect(askedForIt).toBeTruthy();
  });

  it('lets the venue approve it into a draft event', async () => {
    const owner = [...world.owners.values()].find((o) => o.businessId === businessId);
    expect(owner, 'the proposal went to a venue in this world').toBeDefined();
    actAs(owner! as never);

    const decided = await call(decideProposal, {
      method: 'PATCH',
      path: `/api/business/proposals/${proposalId}`,
      body: { decision: 'approve' },
      params: { id: proposalId },
    });
    expect(decided.status).toBe(200);

    const { data } = await admin
      .from('events')
      .select('id, status, proposal_id')
      .eq('proposal_id', proposalId)
      .single();
    expect(data?.status).toBe('approved_draft');
    eventId = data!.id as string;
  });

  it('publishes it', async () => {
    const owner = [...world.owners.values()].find((o) => o.businessId === businessId)!;
    actAs(owner as never);
    const published = await call(publishEvent, {
      method: 'POST',
      path: `/api/business/events/${eventId}/publish`,
      params: { id: eventId },
    });
    expect(published.status).toBe(200);

    const { data } = await admin.from('events').select('status').eq('id', eventId).single();
    expect(data?.status).toBe('published');
  });

  it('puts it in front of someone whose demand produced it', async () => {
    const recommended = await getRecommendedEvents(askedForIt, 20);
    const ids = recommended.map((row) => row.event.id);
    expect(ids, 'the event this member asked for comes back to them').toContain(eventId);
  });

  it('explains the recommendation rather than just listing it', async () => {
    const recommended = await getRecommendedEvents(askedForIt, 20);
    const mine = recommended.find((row) => row.event.id === eventId);
    expect(mine?.explanation ?? '').not.toHaveLength(0);
  });
});
