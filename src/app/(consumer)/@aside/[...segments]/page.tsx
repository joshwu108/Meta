import { getCurrentUser } from '@/features/core/server/current-user';
import { AgentAside } from '@/features/core/components/app-shell/AgentAside';

/**
 * Catch-all for the right-rail slot so client-side navigation into any consumer route still gets
 * the default agent strip (a slot with only `default.tsx` renders empty on soft navigation).
 * A more specific `@aside/<route>/page.tsx` takes precedence.
 */
export default async function CatchAllAside() {
  const user = await getCurrentUser();
  return <AgentAside displayName={user?.profile.display_name ?? 'you'} />;
}
