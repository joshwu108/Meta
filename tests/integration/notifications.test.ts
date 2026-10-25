import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, cleanupTestUsers, createTestUser, type TestUser } from './helpers';

vi.mock('server-only', () => ({}));

const admin = adminClient();
let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  [alice, bob] = await Promise.all([createTestUser(admin, 'alice'), createTestUser(admin, 'bob')]);
});

afterAll(async () => {
  await cleanupTestUsers(admin);
});

describe('notify() and notifications RLS', () => {
  it('notify() inserts a row the recipient can list and mark read', async () => {
    const { notify } = await import('@/features/core/index');
    const { listNotifications, markNotificationRead, countUnread } = await import('@/features/core/server/notifications');
    await notify(alice.id, 'connection_request', { title: 'Bob wants to connect' });
    await notify(alice.id, 'event_recommended', { body: 'Pottery night' });

    const before = await listNotifications(alice.client, {});
    expect(before.items).toHaveLength(2);
    expect(before.unreadCount).toBe(2);
    expect(before.items[0]!.type).toBe('event_recommended');

    const target = before.items.find((item) => item.type === 'connection_request')!;
    const updated = await markNotificationRead(alice.client, target.id);
    expect(updated.read_at).not.toBeNull();
    const again = await markNotificationRead(alice.client, target.id);
    expect(again.read_at).toBe(updated.read_at);
    expect(await countUnread(alice.client)).toBe(1);
    const unreadOnly = await listNotifications(alice.client, { unreadOnly: true });
    expect(unreadOnly.items.map((item) => item.id)).toEqual([before.items.find((item) => item.type === 'event_recommended')!.id]);
  });

  it('notify() rejects unknown types', async () => {
    const { notify } = await import('@/features/core/index');
    await expect(notify(alice.id, 'spam' as never, {})).rejects.toThrow();
  });

  it("another user cannot list or mark someone else's notifications", async () => {
    const { data } = await bob.client.from('notifications').select('id').eq('user_id', alice.id);
    expect(data).toEqual([]);
    const { data: mine } = await admin.from('notifications').select('id').eq('user_id', alice.id).limit(1).single();
    const { markNotificationRead } = await import('@/features/core/server/notifications');
    await expect(markNotificationRead(bob.client, mine!.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('authenticated users cannot insert notifications directly (service role only)', async () => {
    const { error } = await bob.client.from('notifications').insert({ user_id: alice.id, type: 'group_invite', payload: {} });
    expect(error).not.toBeNull();
  });
});

describe('logAgentAction()', () => {
  it('records a row the user can read and never throws on bad input', async () => {
    const { logAgentAction } = await import('@/features/core/index');
    await expect(logAgentAction({ userId: alice.id, action: 'extract_preferences', permissionsUsed: ['interests'], result: 'extracted 3 interests' })).resolves.toBe(true);
    await expect(logAgentAction({ userId: null, actor: 'demand_engine', action: 'cluster', result: 'found 1 cluster' })).resolves.toBe(true);
    await expect(logAgentAction({ action: '', result: 'x' })).resolves.toBe(false);
    // A non-user id (e.g. a business id) violates the FK: reported as false, never thrown.
    await expect(logAgentAction({ userId: crypto.randomUUID(), action: 'publish_event', result: 'published' })).resolves.toBe(false);

    const { data } = await alice.client.from('agent_action_log').select('*');
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ action: 'extract_preferences', actor: 'personal_agent', permissions_used: ['interests'] });
    const { data: system } = await admin.from('agent_action_log').select('user_id').eq('actor', 'demand_engine');
    expect(system!.length).toBeGreaterThan(0);
    const { data: bobView } = await bob.client.from('agent_action_log').select('id');
    expect(bobView).toEqual([]);
  });
});
