import Link from "next/link";
import type { RecommendedEvent } from "../server/recommended";
import { EventCover } from "./EventCover";
import { formatPrice, formatWhen } from "./format";
import { AiTag, AvatarStack } from "@/features/core/components/ui";
import { SpotsMeter } from "./local-ui";
import s from "./events.module.css";

/** The page's lead element: full width, 2:1 imagery, explanation under the AI tag. */
export function LeadEventCard({ item }: { item: RecommendedEvent }) {
  const { event } = item;
  return (
    <Link href={`/events/${event.id}`} className={s.card} aria-label={`For you: ${event.title}`}>
      <span className={s.meta}>For you</span>
      <EventCover imageUrl={event.business.imageUrl} category={event.category} lead />
      <h2 className={s.leadTitle}>{event.title}</h2>
      <p className={s.meta}>
        {formatWhen(event.startsAt)} · {event.business.name}, {event.business.neighborhood} · {formatPrice(event.priceCents)}
      </p>
      <div className={s.explain}>
        <AiTag />
        <span>{item.explanation}</span>
      </div>
      <SpotsMeter confirmed={event.confirmedCount} capacity={event.capacity} />
      {event.friendsGoing.length > 0 ? <AvatarStack people={event.friendsGoing.map((f) => ({ name: f.displayName, src: f.avatarUrl }))} size={32} /> : null}
    </Link>
  );
}
