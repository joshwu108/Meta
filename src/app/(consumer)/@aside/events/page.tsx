import { EventFilters } from "@/features/events/components/EventFilters";
import { EventsPageFilters } from "@/features/events/schemas";

/** Events' right rail (>=1024px): the filter form for the All / This week lists. */
export default async function EventsAside({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <EventFilters values={EventsPageFilters.parse(await searchParams)} />;
}
