import { CalendarSearch } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AgentStrip, GroupsSection, NearbyBand, PeopleRail } from "@/features/events/components/DiscoverSections";
import { EventCard } from "@/features/events/components/EventCard";
import { LeadEventCard } from "@/features/events/components/LeadEventCard";
import { EmptyState } from "@/features/core/components/ui";
import s from "@/features/events/components/events.module.css";
import { getNearbyBusinesses } from "@/features/events/server/nearby";
import { getRecommendedEvents } from "@/features/events/server/recommended";
import { getCurrentUserId, getPublicGroups, getSuggestedPeople } from "@/features/events/server/stubs";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");
  const [recommended, nearby, groups, people] = await Promise.all([
    getRecommendedEvents(userId, 6),
    getNearbyBusinesses(userId, 5),
    getPublicGroups(3),
    getSuggestedPeople(userId, 3),
  ]);
  const [lead, ...rest] = recommended;

  return (
    <div className={s.column}>
      <h1 className={s.pageTitle}>Discover</h1>
      {lead ? (
        <LeadEventCard item={lead} />
      ) : (
        <div className={s.card}>
          <EmptyState icon={<CalendarSearch size={20} aria-hidden />} title="No events in the next three weeks yet." action={<Link href="/events">Browse all events</Link>} />
        </div>
      )}
      <PeopleRail people={people} />
      {rest.length > 0 ? (
        <section className={s.section} aria-labelledby="more-title">
          <h2 id="more-title" className={s.sectionTitle}>More for you</h2>
          <ul className={s.list}>
            {rest.slice(0, 3).map((r) => <li key={r.event.id}><EventCard event={r.event} explanation={r.score === null ? null : r.explanation} /></li>)}
          </ul>
        </section>
      ) : null}
      <NearbyBand businesses={nearby} />
      <GroupsSection groups={groups} />
      <AgentStrip recommendations={recommended} />
    </div>
  );
}
