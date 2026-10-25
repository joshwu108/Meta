import { MapPin } from "lucide-react";
import Link from "next/link";
import type { EventDetail } from "../server/detail";
import { Avatar } from "@/features/core/components/ui";
import s from "./events.module.css";

export function VenueCard({ venue }: { venue: EventDetail["venue"] }) {
  return (
    <section className={s.card} aria-labelledby="venue-title">
      <h2 id="venue-title" className={s.cardTitle}>{venue.name}</h2>
      <p className={s.meta}><MapPin size={14} aria-hidden /> {venue.address}, {venue.neighborhood}</p>
      {venue.description ? <p style={{ margin: 0 }}>{venue.description}</p> : null}
      <Link href="/places">More places nearby</Link>
    </section>
  );
}

export function AboutCard({ description }: { description: string }) {
  return (
    <section className={s.card} aria-labelledby="about-title">
      <h2 id="about-title" className={s.cardTitle}>About</h2>
      <p style={{ margin: 0, whiteSpace: "pre-line", lineHeight: "var(--leading-relaxed)" }}>{description}</p>
    </section>
  );
}

export function WhoIsGoing({ event }: { event: EventDetail }) {
  const { count, avatars } = event.attendeePreview;
  return (
    <section className={s.card} aria-labelledby="going-title">
      <h2 id="going-title" className={s.cardTitle}>Who&apos;s going</h2>
      <p className={s.meta}>{count} going</p>
      {avatars.length > 0 ? (
        <div className={s.row}>
          {avatars.map((a) => <Avatar key={a.userId} name={a.displayName ?? ""} src={a.avatarUrl} size={40} />)}
        </div>
      ) : (
        <p className={s.meta}>{event.rsvpStatus === "confirmed" ? "Nobody has shared their name yet." : "RSVP to see who else is going."}</p>
      )}
    </section>
  );
}
