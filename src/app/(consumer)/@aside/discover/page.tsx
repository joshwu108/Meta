import { AgentAside } from "@/features/core/components/app-shell/AgentAside";
import { getCurrentUser } from "@/features/core";
import { AgentStrip, DISCOVER_RECOMMENDATIONS } from "@/features/events/components/DiscoverSections";
import { getRecommendedEventsCached } from "@/features/events/server/recommended";

/** Discover's right rail (>=1024px): 01's agent card, then 06's insight from the same memoized ranking as the page. */
export default async function DiscoverAside() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <AgentAside displayName={user.profile.display_name} />
      <AgentStrip recommendations={await getRecommendedEventsCached(user.id, DISCOVER_RECOMMENDATIONS)} />
    </div>
  );
}
