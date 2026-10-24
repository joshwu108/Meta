import { CalendarX } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EventCard } from "@/features/events/components/EventCard";
import { EmptyState } from "@/features/events/components/ui";
import s from "@/features/events/components/events.module.css";
import type { EventCard as EventCardData } from "@/features/events/server/cards";
import { listEventFeed } from "@/features/events/server/feed";
import { getRecommendedEvents } from "@/features/events/server/recommended";
import { getCurrentUserId } from "@/features/events/server/stubs";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "for-you", label: "For you" },
  { key: "all", label: "All" },
  { key: "week", label: "This week" },
] as const;
type Tab = (typeof TABS)[number]["key"];

async function load(userId: string, tab: Tab): Promise<Array<{ event: EventCardData; explanation: string | null }>> {
  if (tab === "for-you") {
    const recs = await getRecommendedEvents(userId, 20);
    return recs.map((r) => ({ event: r.event, explanation: r.score === null ? null : r.explanation }));
  }
  const to = tab === "week" ? new Date(Date.now() + 7 * 86_400_000).toISOString() : undefined;
  const page = await listEventFeed(userId, { page: 1, limit: 50, to });
  return page.items.map((event) => ({ event, explanation: null }));
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");
  const requested = (await searchParams).tab;
  const tab: Tab = TABS.some((t) => t.key === requested) ? (requested as Tab) : "for-you";
  const items = await load(userId, tab);

  return (
    <main className={s.column}>
      <h1 className={s.pageTitle}>Events</h1>
      <nav className={s.tabs} aria-label="Event lists">
        {TABS.map((t) => (
          <Link key={t.key} href={`/events?tab=${t.key}`} className={`${s.tab} ${t.key === tab ? s.tabActive : ""}`} aria-current={t.key === tab ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <div className={s.card}><EmptyState icon={<CalendarX size={20} aria-hidden />} text="Nothing scheduled here yet." /></div>
      ) : (
        <ul className={s.list}>
          {items.map(({ event, explanation }) => <li key={event.id}><EventCard event={event} explanation={explanation} /></li>)}
        </ul>
      )}
    </main>
  );
}
