import { MapPin, Users } from "lucide-react";
import Link from "next/link";
import type { NearbyBusiness } from "../server/nearby";
import type { RecommendedEvent } from "../server/recommended";
import type { GroupCard, SuggestedPerson } from "../server/stubs/social";
import { formatWhen, SLOT_PHRASES } from "./format";
import { AiRing, AiTag, Avatar, EmptyState } from "@/features/core/components/ui";
import { buttonClass } from "./local-ui";
import s from "./events.module.css";

/** Recommendations Discover shows; its page and `@aside` rail must ask for the same number to share the memo. */
export const DISCOVER_RECOMMENDATIONS = 6;

export function PeopleRail({ people }: { people: SuggestedPerson[] }) {
  return (
    <section className={s.section} aria-labelledby="people-title">
      <h2 id="people-title" className={s.sectionTitle}>People you might click with</h2>
      {people.length === 0 ? (
        <div className={s.card}>
          <EmptyState icon={<Users size={20} aria-hidden />} title="Your matches show up here." action={<Link href="/match">Find people</Link>} />
        </div>
      ) : (
        <div className={s.rail3}>
          {people.slice(0, 3).map((p) => (
            <article key={p.userId} className={s.card}>
              <span className={s.row}><Avatar name={p.displayName} src={p.avatarUrl} size={40} /> <strong>{p.displayName}</strong></span>
              <p className={s.explain}><AiTag /> <span className={s.meta}>{p.explanation}</span></p>
              <Link href="/match" className={buttonClass()}>Connect</Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function NearbyBand({ businesses }: { businesses: NearbyBusiness[] }) {
  if (businesses.length === 0) return null;
  return (
    <section className={s.section} aria-labelledby="nearby-title">
      <div className={s.spread}>
        <h2 id="nearby-title" className={s.sectionTitle}>Nearby places</h2>
        <Link href="/places">See all</Link>
      </div>
      <ul className={s.list}>
        {businesses.slice(0, 4).map((b) => (
          <li key={b.id} className={s.card}>
            <div className={s.spread}>
              <strong>{b.name}</strong>
              <span className={s.meta}><MapPin size={14} aria-hidden /> {b.distanceKm === null ? b.neighborhood : `${b.distanceKm} km`}</span>
            </div>
            {b.nextEvent ? (
              <Link href={`/events/${b.nextEvent.id}`} className={s.meta}>Next: {b.nextEvent.title} · {formatWhen(b.nextEvent.startsAt)}</Link>
            ) : (
              <span className={s.meta}>No upcoming events</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GroupsSection({ groups }: { groups: GroupCard[] }) {
  if (groups.length === 0) return null;
  return (
    <section className={s.section} aria-labelledby="groups-title">
      <h2 id="groups-title" className={s.sectionTitle}>Groups to join</h2>
      <ul className={s.list}>
        {groups.map((g) => (
          <li key={g.id}>
            <Link href={`/groups/${g.id}`} className={`${s.card} ${s.spread}`}>
              <strong>{g.name}</strong>
              <span className={s.meta}>{g.memberCount} members</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Your agent noticed…": a deterministic summary of the ranking, marked as AI-derived. */
export function AgentStrip({ recommendations }: { recommendations: RecommendedEvent[] }) {
  const slotCounts = new Map<string, number>();
  for (const r of recommendations) {
    const slot = r.breakdown && r.breakdown.slot > 0 ? r.slot : null;
    if (slot) slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1);
  }
  const [topSlot, count] = [...slotCounts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const line = topSlot
    ? `${count} ${count === 1 ? "event fits" : "events fit"} your ${SLOT_PHRASES[topSlot]}s in the next three weeks.`
    : "Tell your agent when you're free to get sharper picks.";
  return (
    <aside className={s.card} aria-label="Agent suggestion">
      <div className={s.row}>
        <AiRing><Avatar name="Agent" size={32} /></AiRing>
        <strong>Your agent noticed…</strong>
      </div>
      <p className={s.explain}><AiTag /> <span>{line}</span></p>
      <Link href="/agent" className={buttonClass("secondary")}>Ask your agent</Link>
    </aside>
  );
}

