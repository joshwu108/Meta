import { Bell, CalendarCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EventCard } from "@/features/events/components/EventCard";
import { FollowUpCard } from "@/features/events/components/FollowUpCard";
import { formatWhen } from "@/features/events/components/format";
import { Avatar, EmptyState, StatusPill } from "@/features/events/components/ui";
import s from "@/features/events/components/events.module.css";
import { getActivity } from "@/features/events/server/activity";
import { getCurrentUserId } from "@/features/events/server/stubs";

export const dynamic = "force-dynamic";

const NOTIFICATION_TEXT: Record<string, string> = {
  rsvp_confirmed: "Your RSVP is confirmed",
  event_updated: "An event you're going to changed",
  event_cancelled: "An event you're going to was cancelled",
  group_invite: "You were invited",
  reconnect_suggestion: "Your agents suggested a follow-up",
  connection_request: "New connection request",
  connection_accepted: "Connection accepted",
  event_published: "A new event matches your interests",
  event_recommended: "Your agent recommended an event",
};

export default async function ActivityPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");
  const activity = await getActivity(userId);

  return (
    <main className={s.column}>
      <h1 className={s.pageTitle}>My Activity</h1>

      <section className={s.section} aria-labelledby="upcoming-title">
        <h2 id="upcoming-title" className={s.sectionTitle}>Upcoming</h2>
        {activity.upcoming.length === 0 ? (
          <div className={s.card}><EmptyState icon={<CalendarCheck size={20} aria-hidden />} text="No plans yet." action={<Link href="/events">Find an event</Link>} /></div>
        ) : (
          <ul className={s.list}>{activity.upcoming.map((e) => <li key={e.id}><EventCard event={e} /></li>)}</ul>
        )}
      </section>

      {activity.saved.length > 0 ? (
        <section className={s.section} aria-labelledby="saved-title">
          <h2 id="saved-title" className={s.sectionTitle}>Saved</h2>
          <ul className={s.list}>{activity.saved.map((e) => <li key={e.id}><EventCard event={e} /></li>)}</ul>
        </section>
      ) : null}

      {activity.followUps.length > 0 ? (
        <section className={s.section} aria-labelledby="followups-title">
          <h2 id="followups-title" className={s.sectionTitle}>Follow-up suggestions</h2>
          <ul className={s.list}>{activity.followUps.map((f) => <li key={f.id}><FollowUpCard followUp={f} /></li>)}</ul>
        </section>
      ) : null}

      {activity.invitations.length > 0 ? (
        <section className={s.section} aria-labelledby="invites-title">
          <h2 id="invites-title" className={s.sectionTitle}>Invitations</h2>
          <ul className={s.list}>
            {activity.invitations.map((i) => (
              <li key={i.id}>
                <Link href={`/events/${i.event.id}`} className={s.card}>
                  <span className={s.row}><Avatar name={i.sender?.displayName ?? "?"} src={i.sender?.avatarUrl} /> {i.sender?.displayName ?? "A group member"} invited you</span>
                  <strong>{i.event.title}</strong>
                  <span className={s.meta}>{formatWhen(i.event.startsAt)} · {i.event.business.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activity.connectionRequests.length > 0 ? (
        <section className={s.section} aria-labelledby="requests-title">
          <h2 id="requests-title" className={s.sectionTitle}>Connection requests</h2>
          <ul className={s.list}>
            {activity.connectionRequests.map((r) => (
              <li key={r.id} className={`${s.card} ${s.spread}`}>
                <span className={s.row}><Avatar name={r.requester?.displayName ?? "?"} src={r.requester?.avatarUrl} /> {r.requester?.displayName ?? "Someone"}</span>
                <Link href="/match">Respond</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activity.past.length > 0 ? (
        <section className={s.section} aria-labelledby="past-title">
          <h2 id="past-title" className={s.sectionTitle}>Past events</h2>
          <ul className={s.list}>
            {activity.past.map((e) => (
              <li key={e.id} className={s.section}>
                <EventCard event={e} />
                {!e.feedbackGiven && e.status === "completed" ? <Link href={`/events/${e.id}`} className={s.meta}>Leave feedback and reconnect</Link> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={s.section} aria-labelledby="notifications-title">
        <h2 id="notifications-title" className={s.sectionTitle}>Notifications</h2>
        {activity.notifications.length === 0 ? (
          <div className={s.card}><EmptyState icon={<Bell size={20} aria-hidden />} text="You're all caught up." /></div>
        ) : (
          <ul className={`${s.list} ${s.card}`}>
            {activity.notifications.map((n) => (
              <li key={n.id} className={s.spread}>
                <span>{NOTIFICATION_TEXT[n.type] ?? n.type}</span>
                <span className={s.row}>
                  {n.readAt ? null : <StatusPill status="new" />}
                  <span className={s.meta}>{formatWhen(n.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
