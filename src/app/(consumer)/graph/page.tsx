import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/features/core';
import { GraphScreen } from '@/features/graph/components/GraphScreen';
import { getGraphSnapshot } from '@/features/graph/server/snapshot';

export const metadata = { title: 'Your graph' };

/** Screen 7 `/graph`: the viewer's connections, what formed them, and what is forming now. */
export default async function GraphPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const snapshot = await getGraphSnapshot(user.id);
  return <GraphScreen snapshot={snapshot} />;
}
