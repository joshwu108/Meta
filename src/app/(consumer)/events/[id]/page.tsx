import { MapPin } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { BookmarkButton } from "@/features/events/components/BookmarkButton";
import { EventCover } from "@/features/events/components/EventCover";
import { EventStatusSection } from "@/features/events/components/EventStatusSection";
import { formatPrice, formatTime, formatWhen } from "@/features/events/components/format";
import { Avatar, CapacityMeter, StatusPill } from "@/features/events/components/ui";
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

      <section className={s.card} aria-labelledby="venue-title">
        <h2 id="venue-title" className={s.cardTitle}>{event.venue.name}</h2>
        <p className={s.meta}><MapPin size={14} aria-hidden /> {event.venue.address}, {event.venue.neighborhood}</p>
        {event.venue.description ? <p style={{ margin: 0 }}>{event.venue.description}</p> : null}
      </section>

      <section className={s.card} aria-labelledby="about-title">
        <h2 id="about-title" className={s.cardTitle}>About</h2>
        <p style={{ margin: 0, whiteSpace: "pre-line", lineHeight: "var(--leading-relaxed)" }}>{event.description}</p>
      </section>

      <section className={s.card} aria-labelledby="going-title">
        <h2 id="going-title" className={s.cardTitle}>Who&apos;s going</h2>
        <p className={s.meta}>{event.attendeePreview.count} going</p>
        {event.attendeePreview.avatars.length > 0 ? (
          <div className={s.row}>
            {event.attendeePreview.avatars.map((a) => <Avatar key={a.userId} name={a.displayName ?? ""} src={a.avatarUrl} size={40} />)}
          </div>
        ) : (
          <p className={s.meta}>{event.rsvpStatus === "confirmed" ? "Nobody has shared their name yet." : "RSVP to see who else is going."}</p>
        )}
      </section>
    </main>
  );
}
