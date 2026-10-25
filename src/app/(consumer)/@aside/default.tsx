import { getCurrentUser } from '@/features/core/server/current-user';
import { AgentAside } from '@/features/core/components/app-shell/AgentAside';

/**
 * Fallback for the right-rail slot on hard navigation / reload. `[...segments]/page.tsx` covers
 * soft navigation; both render the agent strip. Override per page with `@aside/<route>/page.tsx`.
 */
export default async function DefaultAside() {
  const user = await getCurrentUser();
  return <AgentAside displayName={user?.profile.display_name ?? 'you'} />;
}
