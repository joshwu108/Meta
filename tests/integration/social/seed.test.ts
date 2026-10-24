import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { runSeedWith, type SeedSummary } from '../../../supabase/seed/runner';

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let summary: SeedSummary;
const ids = new Map<string, string>();

beforeAll(async () => {
  summary = await runSeedWith(admin);
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const user of data.users) if (user.email) ids.set(user.email.split('@')[0]!, user.id);
}, 60_000);

describe('workstream 03 seed contribution', () => {
  it('loads both groups with their members and a pending invitation', async () => {
    expect(summary.groups).toBe(2);
    const { data: groups } = await admin.from('groups').select('id, name, visibility, kind, interests, creator_id').in('name', ['Mission Makers', 'Thursday Night Crew']);
    const makers = groups?.find((g) => g.name === 'Mission Makers');
    const crew = groups?.find((g) => g.name === 'Thursday Night Crew');
    expect(makers).toMatchObject({ visibility: 'public', kind: 'interest', creator_id: ids.get('maya') });
    expect(makers?.interests).toContain('pottery');
    expect(crew).toMatchObject({ visibility: 'private', kind: 'private', creator_id: ids.get('sam') });

    const { data: members } = await admin.from('group_members').select('user_id, role, status').eq('group_id', crew!.id);
    expect(members?.filter((m) => m.status === 'active')).toHaveLength(3);
    expect(members?.find((m) => m.role === 'owner')?.user_id).toBe(ids.get('sam'));
    expect(members?.find((m) => m.status === 'invited')?.user_id).toBe(ids.get('maya'));
    const { data: invitations } = await admin.from('invitations').select('kind, status, sender_id').eq('group_id', crew!.id).eq('recipient_id', ids.get('maya')!);
    expect(invitations).toEqual([{ kind: 'group', status: 'pending', sender_id: ids.get('sam') }]);
  });

  it('loads six accepted connections, none for the live demo user', async () => {
    expect(summary.connections).toBe(6);
    const demo = ids.get('demo.new')!;
    const { count } = await admin.from('connections').select('id', { count: 'exact', head: true }).or(`requester_id.eq.${demo},recipient_id.eq.${demo}`);
    expect(count).toBe(0);
    const { data } = await admin.from('connections').select('status');
    expect(data?.every((row) => row.status === 'accepted')).toBe(true);
  });

  it('loads one block pair', async () => {
    expect(summary.blocks).toBe(1);
    const { data } = await admin.from('blocks').select('blocker_id, blocked_id');
    expect(data).toEqual([{ blocker_id: ids.get('kai'), blocked_id: ids.get('leo') }]);
  });
});
