import { notFound, redirect } from "next/navigation";
import { BookmarkButton } from "@/features/events/components/BookmarkButton";
import { EventCover } from "@/features/events/components/EventCover";
import { AboutCard, VenueCard, WhoIsGoing } from "@/features/events/components/EventInfoCards";
import { EventStatusSection } from "@/features/events/components/EventStatusSection";
import { formatPrice, formatTime, formatWhen } from "@/features/events/components/format";
import { CapacityMeter, StatusPill } from "@/features/events/components/ui";
import s from "@/features/events/components/events.module.css";
import { EventIdParams } from "@/features/events/schemas";
import { getAttendeeList } from "@/features/events/server/attendees";
import { getEventDetail } from "@/features/events/server/detail";
import { ApiError, getCurrentUserId } from "@/features/events/server/stubs";

export const dynamic = "force-dynamic";

async function loadDetail(userId: string, id: string) {
  try {
    return await getEventDetail(userId, id);
  } catch (err) {
    if (err instanceof ApiError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");
  const parsed = EventIdParams.safeParse(await params);
  if (!parsed.success) notFound();
  const event = await loadDetail(userId, parsed.data.id);
  const completedAttendee = event.status === "completed" && event.rsvpStatus === "confirmed";
  const attendees = completedAttendee ? await getAttendeeList(userId, event.id) : null;

  return (
    <main className={s.column}>
      <article className={s.card}>
        <EventCover imageUrl={event.business.imageUrl} category={event.category} lead />
        <div className={s.spread}>
          <h1 className={s.leadTitle}>{event.title}</h1>
          <StatusPill status={event.needsReconfirm ? "reconfirm" : event.rsvpStatus === "confirmed" ? "confirmed" : event.status} />
        </div>
        <p className={s.meta}>
          {formatWhen(event.startsAt)} – {formatTime(event.endsAt)} · {formatPrice(event.priceCents)}{event.format ? ` · ${event.format}` : ""}
        </p>
        <div className={s.spread}>
          <div style={{ flex: 1 }}><CapacityMeter confirmed={event.confirmedCount} capacity={event.capacity} /></div>
          <BookmarkButton eventId={event.id} initial={event.bookmarked} />
        </div>
        <EventStatusSection event={event} attendees={attendees?.attendees ?? null} feedbackGiven={event.feedbackGiven} />
      </article>

      <VenueCard venue={event.venue} />
      <AboutCard description={event.description} />
      <WhoIsGoing event={event} />
    </main>
  );
}
