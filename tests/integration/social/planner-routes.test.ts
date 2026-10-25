import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Ai from '@/lib/ai';
import type * as GroupStubs from '@/features/groups/server/stubs';
import type { EventPublic, EventSummary } from '@/shared/types';
import { adminClient, createTestUser, type TestUser } from '../helpers';
import { actAs, call, cleanupSocialUsers, setProfile, setTestOrigin } from './support';

const captured = vi.hoisted(() => ({
  inputs: [] as unknown[],
  events: [] as EventSummary[],
  details: new Map<string, EventPublic>(),
  goingUserId: undefined as string | undefined,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', async () => {
  const support = await import('./support');
  return { createServerClient: async () => support.session.client };
});
vi.mock('@/lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof Ai>();
  return {
    ...actual,
    generateStructured: async (opts: { input: unknown; prompt: string }) => {
      captured.inputs.push(opts.input);
      const { readFile } = await import('node:fs/promises');
      return JSON.parse(await readFile(`src/lib/ai/fixtures/${opts.prompt}.json`, 'utf8'));
    },
  };
});
vi.mock('@/features/groups/server/stubs', async (importOriginal) => {
  const actual = await importOriginal<typeof GroupStubs>();
  return {
    ...actual,
    getUpcomingEventsForUser: async (userId: string) =>
      captured.events.map((e) => ({ ...e, rsvpStatus: userId === captured.goingUserId ? 'confirmed' : null })),
    getEventPublic: async (id: string) => captured.details.get(id) ?? null,
  };
});

const { POST: createGroup } = await import('@/app/api/groups/route');
const { GET: getGroup } = await import('@/app/api/groups/[id]/route');
const { POST: plan } = await import('@/app/api/groups/[id]/plan/route');
const { POST: vote } = await import('@/app/api/groups/[id]/plans/[planId]/vote/route');
const { aiRateLimiter } = await import('@/lib/api');

setTestOrigin('planner-routes');
const admin = adminClient();
let owner: TestUser, maker: TestUser, quiet: TestUser, outsider: TestUser;
let groupId: string;
const EVENT_ID = '7a1f3c2e-5b4d-4e6f-8a9b-0c1d2e3f4a5b';

function nextThursdayEvening(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((4 - d.getUTCDay() + 7) % 7 || 7) + 7);
  d.setUTCHours(26, 0, 0, 0); // Thu 19:00 PDT / 18:00 PST
  return d.toISOString();
}

async function addActive(userId: string) {
  await admin.from('group_members').insert({ group_id: groupId, user_id: userId, role: 'member', status: 'active', joined_at: new Date().toISOString() });
}

beforeAll(async () => {
  [owner, maker, quiet, outsider] = await Promise.all([
    createTestUser(admin, 'plan-owner'),
    createTestUser(admin, 'plan-maker'),
    createTestUser(admin, 'plan-quiet'),
    createTestUser(admin, 'plan-outsider'),
  ]);
  await setProfile(admin, owner, { interests: ['pottery', 'coffee'], slots: ['thu_eve', 'sat_day'], budgetMax: 3000 });
  await setProfile(admin, maker, { interests: ['pottery', 'painting'], slots: ['thu_eve', 'fri_eve'], budgetMax: 2500 }, { matching: true, groupPlan: false });
  await setProfile(admin, quiet, { interests: ['skydiving'], categories: ['outdoors'], slots: ['thu_eve'] }, { matching: true, groupPlan: false });
  await setProfile(admin, outsider);
  actAs(owner);
  groupId = (await call(createGroup, { method: 'POST', body: { name: 'Clay Collective', visibility: 'private', interests: ['pottery'] } })).body.data.id;
  await addActive(maker.id);
  await addActive(quiet.id);
  const startsAt = nextThursdayEvening();
  const business = { id: 'b1', name: 'Kiln & Cup', category: 'creative' as const, neighborhood: 'Mission', address: '3120 Valencia St', description: '', imageUrl: null };
  captured.events = [{ id: EVENT_ID, title: 'Wheel Throwing Basics', startsAt, status: 'published', business, rsvpStatus: null }];
  captured.details.set(EVENT_ID, { ...captured.events[0]!, description: 'Beginners welcome', category: 'creative', endsAt: startsAt, capacity: 10, confirmedCount: 3, priceCents: 2000, format: 'workshop', source: 'business_manual' });
}, 60_000);

beforeEach(() => {
  captured.inputs.length = 0;
  aiRateLimiter.reset();
});

afterAll(async () => {
  await cleanupSocialUsers(admin);
});

describe('POST /api/groups/:id/plan', () => {
  it('refuses when fewer than two members allow group planning', async () => {
    actAs(owner);
    const res = await call(plan, { method: 'POST', params: { id: groupId }, body: { request: 'Something creative?' } });
    expect(res.status).toBe(400);
    expect(res.body.error?.message).toBe('Not enough members have allowed group planning.');
    expect(captured.inputs).toHaveLength(0);
  });

  it('plans from consenting members only, in shared slots, with an existing event and 2–4 suggestions', async () => {
    await setProfile(admin, maker, { interests: ['pottery', 'painting'], slots: ['thu_eve', 'fri_eve'], budgetMax: 2500 }, { matching: true, groupPlan: true });
    actAs(owner);
    const res = await call(plan, { method: 'POST', params: { id: groupId }, body: { request: 'Something with clay, maybe with Test plan-quiet?' } });
    expect(res.status).toBe(201);
    const view = res.body.data;
    expect(view.membersIncluded).toBe(2);
    expect(view.activeMemberCount).toBe(3);
    expect(view.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(view.suggestions.length).toBeLessThanOrEqual(4);
    expect(view.suggestions.every((s: { slot: string }) => s.slot === 'thu_eve')).toBe(true);
    expect(view.suggestions.map((s: { title: string }) => s.title)).not.toContain('Saturday glaze session');
    expect(view.suggestions[0]).toMatchObject({ kind: 'existing_event', eventId: EVENT_ID, needsVenue: false });
  });

  it('never sends names, ids or non-consenting members’ preferences to the model', async () => {
    actAs(owner);
    await call(plan, { method: 'POST', params: { id: groupId }, body: { request: 'Plan for Test plan-maker and Test plan-quiet' } });
    expect(captured.inputs).toHaveLength(1);
    const text = JSON.stringify(captured.inputs[0]);
    for (const user of [owner, maker, quiet]) expect(text).not.toContain(user.id);
    expect(text).not.toMatch(/plan-maker|plan-quiet|plan-owner/i);
    expect(text).not.toContain('skydiving');
    expect(text).toContain('"sharedSlots":["thu_eve"]');
    expect(text).toContain('"budgetMaxCents":2500');
  });

  it('records the planning in each consenting member’s agent log only', async () => {
    const { data } = await admin.from('agent_action_log').select('user_id, actor, action, permissions_used').eq('action', 'group_plan').in('user_id', [owner.id, maker.id, quiet.id]);
    const users = new Set((data ?? []).map((row) => row.user_id));
    expect(users).toEqual(new Set([owner.id, maker.id]));
    expect(data?.[0]).toMatchObject({ actor: 'coordination', permissions_used: ['group_plan'] });
  });

  it('is forbidden for members of a private group they did not create, and for outsiders', async () => {
    actAs(maker);
    expect((await call(plan, { method: 'POST', params: { id: groupId }, body: { request: 'x' } })).status).toBe(403);
    actAs(outsider);
    expect((await call(plan, { method: 'POST', params: { id: groupId }, body: { request: 'x' } })).status).toBe(404);
  });
});

describe('group page: plan, votes and events', () => {
  it('shows the latest plan with consent counts to members, not to outsiders', async () => {
    actAs(maker);
    const res = await call(getGroup, { params: { id: groupId } });
    expect(res.body.data.latestPlan).toMatchObject({ membersIncluded: 2, activeMemberCount: 3 });
    expect(res.body.data.latestPlanTitle).toBe(res.body.data.latestPlan.suggestions[0].title);
  });

  it('toggles votes and marks a venue request eligible at half the members', async () => {
    actAs(owner);
    const { latestPlan } = (await call(getGroup, { params: { id: groupId } })).body.data;
    const index = latestPlan.suggestions.findIndex((s: { kind: string; needsVenue: boolean }) => s.kind === 'new_activity' && s.needsVenue);
    expect(index).toBeGreaterThan(0);
    const first = await call(vote, { method: 'POST', params: { id: groupId, planId: latestPlan.id }, body: { suggestionIndex: index } });
    expect(first.body.data.votes.mine).toEqual([index]);
    expect(first.body.data.venueEligible[index]).toBe(false);
    actAs(maker);
    const second = await call(vote, { method: 'POST', params: { id: groupId, planId: latestPlan.id }, body: { suggestionIndex: index } });
    expect(second.body.data.votes.counts[index]).toBe(2);
    // Three active members is below 04's default MIN_COHORT_SIZE of 4.
    expect(second.body.data).toMatchObject({ venueMinMembers: 4 });
    expect(second.body.data.venueEligible[index]).toBe(false);
    vi.stubEnv('MIN_COHORT_SIZE', '3');
    const smallCohort = (await call(getGroup, { params: { id: groupId } })).body.data.latestPlan;
    expect(smallCohort.venueEligible[index]).toBe(true);
    vi.unstubAllEnvs();
    const undo = await call(vote, { method: 'POST', params: { id: groupId, planId: latestPlan.id }, body: { suggestionIndex: index } });
    expect(undo.body.data.votes.mine).toEqual([]);
    expect((await call(vote, { method: 'POST', params: { id: groupId, planId: latestPlan.id }, body: { suggestionIndex: 3 } })).status).toBe(400);
    actAs(outsider);
    expect((await call(vote, { method: 'POST', params: { id: groupId, planId: latestPlan.id }, body: { suggestionIndex: 0 } })).status).toBe(404);
  });

  it('lists upcoming events members are going to, with the viewer’s own RSVP status (AC5)', async () => {
    captured.goingUserId = maker.id;
    actAs(owner);
    const res = await call(getGroup, { params: { id: groupId } });
    expect(res.body.data.upcomingEvents).toEqual([
      expect.objectContaining({ membersGoing: 1, sharedWithGroup: false, event: expect.objectContaining({ id: EVENT_ID, rsvpStatus: null, business: expect.objectContaining({ name: 'Kiln & Cup' }) }) }),
    ]);
  });

  it('includes events shared with the group through an event invitation', async () => {
    captured.goingUserId = undefined;
    await admin.from('invitations').insert({ kind: 'event', group_id: groupId, event_id: EVENT_ID, sender_id: maker.id, recipient_id: owner.id });
    actAs(owner);
    const res = await call(getGroup, { params: { id: groupId } });
    expect(res.body.data.upcomingEvents).toEqual([expect.objectContaining({ membersGoing: 0, sharedWithGroup: true })]);
  });
});

describe('planner with no slot everyone shares (02 resolveGroupSchedule)', () => {
  it('plans for the times most consenting members can make and says how many', async () => {
    const [satOnly, thuOnly] = await Promise.all([createTestUser(admin, 'plan-split-sat'), createTestUser(admin, 'plan-split-thu')]);
    await setProfile(admin, satOnly, { slots: ['sat_day'] });
    await setProfile(admin, thuOnly, { slots: ['thu_eve'] });
    actAs(owner);
    const split = (await call(createGroup, { method: 'POST', body: { name: 'Split schedules', visibility: 'private' } })).body.data.id;
    for (const user of [satOnly, thuOnly]) {
      await admin.from('group_members').insert({ group_id: split, user_id: user.id, role: 'member', status: 'active', joined_at: new Date().toISOString() });
    }
    const res = await call(plan, { method: 'POST', params: { id: split }, body: { request: 'Anything fun' } });
    expect(res.status).toBe(201);
    const slots = new Set(res.body.data.suggestions.map((s: { slot: string }) => s.slot));
    expect([...slots].every((slot) => slot === 'thu_eve' || slot === 'sat_day')).toBe(true);
    expect(res.body.data.suggestions.every((s: { freeCount: number }) => s.freeCount === 2)).toBe(true);
    const input = JSON.stringify(captured.inputs.at(-1));
    expect(input).toContain('"everyoneFree":false');
    expect(input).not.toContain(satOnly.id);
  });

  it('still refuses when no slot reaches half the members', async () => {
    const [mon, sun] = await Promise.all([createTestUser(admin, 'plan-apart-mon'), createTestUser(admin, 'plan-apart-sun')]);
    await setProfile(admin, mon, { slots: ['mon_eve'] });
    await setProfile(admin, sun, { slots: ['sun_day'] });
    const { data: groupId } = await admin.rpc('create_group_with_owner', { p_creator: mon.id, p_name: 'Never free together', p_visibility: 'private' });
    await admin.from('group_members').insert({ group_id: groupId!, user_id: sun.id, role: 'member', status: 'active', joined_at: new Date().toISOString() });
    actAs(mon);
    const res = await call(plan, { method: 'POST', params: { id: groupId! }, body: { request: 'x' } });
    expect(res.status).toBe(400);
    expect(res.body.error?.message).toBe('Members who allow planning have no free time in common yet.');
  });
});
