import { AgentAside } from "@/features/core/components/app-shell/AgentAside";
import { getCurrentUser } from "@/features/core";
import { EventFilters } from "@/features/events/components/EventFilters";
import { EventsPageFilters } from "@/features/events/schemas";

/** Events' right rail (>=1024px): 01's agent card, then the filter form for the All / This week lists. */
export default async function EventsAside({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getCurrentUser();
  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <AgentAside displayName={user?.profile.display_name ?? "you"} />
      <EventFilters values={EventsPageFilters.parse(await searchParams)} />
    </div>
  );
}
