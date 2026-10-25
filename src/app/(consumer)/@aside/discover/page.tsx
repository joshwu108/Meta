import { AgentStrip, DISCOVER_RECOMMENDATIONS } from "@/features/events/components/DiscoverSections";
import { getRecommendedEventsCached } from "@/features/events/server/recommended";
import { getCurrentUserId } from "@/features/events/server/stubs";

/** Discover's right rail (>=1024px): the agent strip, from the same memoized ranking as the page. */
export default async function DiscoverAside() {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  return <AgentStrip recommendations={await getRecommendedEventsCached(userId, DISCOVER_RECOMMENDATIONS)} />;
}
