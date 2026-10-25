import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/core';
import { listMyGroups } from '@/features/groups';
import { GroupsScreen } from '@/features/groups/components/GroupsScreen';
import { createServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Groups' };

/** Screen 4: invitations, my groups and "Create group". */
export default async function GroupsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const supabase = await createServerClient();
  const groups = await listMyGroups({ userId: user.id, supabase });
  return <GroupsScreen groups={groups} />;
}
