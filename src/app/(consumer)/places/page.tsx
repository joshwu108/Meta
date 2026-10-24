import { MapPin, Store } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { EventCover } from "@/features/events/components/EventCover";
import { formatWhen } from "@/features/events/components/format";
import { EmptyState } from "@/features/events/components/ui";
import s from "@/features/events/components/events.module.css";
import { getNearbyBusinesses } from "@/features/events/server/nearby";
import { getCurrentUserId } from "@/features/events/server/stubs";

export const dynamic = "force-dynamic";

const RADII = [1, 3, 5, 10] as const;
const Query = z.object({ radiusKm: z.coerce.number().refine((n) => (RADII as readonly number[]).includes(n)).catch(5) });

export default async function PlacesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");
  const { radiusKm } = Query.parse(await searchParams);
  const places = await getNearbyBusinesses(userId, radiusKm);

  return (
    <main className={s.column}>
      <h1 className={s.pageTitle}>Places near you</h1>
      <nav className={s.tabs} aria-label="Distance">
        {RADII.map((r) => (
          <Link key={r} href={`/places?radiusKm=${r}`} className={`${s.tab} ${r === radiusKm ? s.tabActive : ""}`} aria-current={r === radiusKm ? "page" : undefined}>
            {r} km
          </Link>
        ))}
      </nav>
      {places.length === 0 ? (
        <div className={s.card}><EmptyState icon={<Store size={20} aria-hidden />} text={`No venues within ${radiusKm} km.`} action={<Link href="/places?radiusKm=10">Look further</Link>} /></div>
      ) : (
        <ul className={s.list}>
          {places.map((p) => (
            <li key={p.id} className={`${s.card} ${s.compact}`}>
              <EventCover imageUrl={p.imageUrl} category={p.category} />
              <div style={{ display: "grid", gap: "var(--space-2)", minWidth: 0 }}>
                <div className={s.spread}>
                  <h2 className={s.cardTitle}>{p.name}</h2>
                  <span className={s.meta}>{p.distanceKm === null ? p.neighborhood : `${p.distanceKm} km`}</span>
                </div>
                <p className={s.meta}><MapPin size={14} aria-hidden /> {p.address}, {p.neighborhood}</p>
                {p.description ? <p style={{ margin: 0 }}>{p.description}</p> : null}
                {p.nextEvent ? (
                  <Link href={`/events/${p.nextEvent.id}`}>Next: {p.nextEvent.title} · {formatWhen(p.nextEvent.startsAt)}</Link>
                ) : (
                  <span className={s.meta}>No upcoming events</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
