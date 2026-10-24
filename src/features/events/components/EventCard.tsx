import Link from "next/link";
import type { EventCard as EventCardData } from "../server/cards";
import { EventCover } from "./EventCover";
import { formatPrice, formatWhen } from "./format";
import { AiTag, AvatarStack, StatusPill } from "@/features/core/components/ui";
import { Pill, SpotsMeter } from "./local-ui";
import s from "./events.module.css";

type Props = { event: EventCardData; explanation?: string | null };

function friendsLine(event: EventCardData): string | null {
  const [first, ...rest] = event.friendsGoing;
  if (!first) return null;
  return rest.length === 0 ? `${first.displayName} is going` : `${first.displayName} and ${rest.length} more friends going`;
}

/** Supporting card: compact, so the lead card carries the page's hierarchy. */
export function EventCard({ event, explanation }: Props) {
  const friends = friendsLine(event);
  const status =
    event.rsvpStatus === "confirmed" || event.rsvpStatus === "waitlisted" ? event.rsvpStatus : event.isFull ? "full" : null;
  return (
    <Link href={`/events/${event.id}`} className={`${s.card} ${s.compact}`}>
      <EventCover imageUrl={event.business.imageUrl} category={event.category} />
      <div style={{ display: "grid", gap: "var(--space-2)", minWidth: 0 }}>
        <div className={s.spread}>
          <h3 className={s.cardTitle}>{event.title}</h3>
          {event.needsReconfirm ? <Pill tone="warning">Needs reconfirm</Pill> : status ? <StatusPill status={status} /> : null}
        </div>
        <p className={s.meta}>
          {formatWhen(event.startsAt)} · {event.business.name} · {formatPrice(event.priceCents)}
        </p>
        <SpotsMeter confirmed={event.confirmedCount} capacity={event.capacity} />
        {friends ? (
          <div className={s.row}>
            <AvatarStack people={event.friendsGoing.map((f) => ({ name: f.displayName, src: f.avatarUrl }))} />
            <span className={s.meta}>{friends}</span>
          </div>
        ) : null}
        {explanation ? (
          <p className={s.explain}>
            <AiTag />
            <span className={s.meta}>{explanation}</span>
          </p>
        ) : null}
      </div>
    </Link>
  );
}
