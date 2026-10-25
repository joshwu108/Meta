import { Bell, CalendarCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Activity } from "../server/activity";
import { EventCard } from "./EventCard";
import { FollowUpCard } from "./FollowUpCard";
import { formatWhen } from "./format";
import { Avatar, EmptyState } from "@/features/core/components/ui";
import { Pill } from "./local-ui";
import s from "./events.module.css";

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

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className={s.section} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={s.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

export function UpcomingSection({ events }: { events: Activity["upcoming"] }) {
  return (
    <Section id="upcoming" title="Upcoming">
      {events.length === 0 ? (
        <div className={s.card}><EmptyState icon={<CalendarCheck size={20} aria-hidden />} title="No plans yet." action={<Link href="/events">Find an event</Link>} /></div>
      ) : (
        <ul className={s.list}>{events.map((e) => <li key={e.id}><EventCard event={e} /></li>)}</ul>
      )}
    </Section>
  );
}

export function SavedSection({ events }: { events: Activity["saved"] }) {
  if (events.length === 0) return null;
  return (
    <Section id="saved" title="Saved">
      <ul className={s.list}>{events.map((e) => <li key={e.id}><EventCard event={e} /></li>)}</ul>
    </Section>
  );
}

export function FollowUpsSection({ followUps }: { followUps: Activity["followUps"] }) {
  if (followUps.length === 0) return null;
  return (
    <Section id="followups" title="Follow-up suggestions">
      <ul className={s.list}>{followUps.map((f) => <li key={f.id}><FollowUpCard followUp={f} /></li>)}</ul>
    </Section>
  );
}

export function InvitationsSection({ invitations }: { invitations: Activity["invitations"] }) {
  if (invitations.length === 0) return null;
  return (
    <Section id="invites" title="Invitations">
      <ul className={s.list}>
        {invitations.map((i) => (
          <li key={i.id}>
            <Link href={`/events/${i.event.id}`} className={s.card}>
              <span className={s.row}><Avatar name={i.sender?.displayName ?? "?"} src={i.sender?.avatarUrl} /> {i.sender?.displayName ?? "A group member"} invited you</span>
              <strong>{i.event.title}</strong>
              <span className={s.meta}>{formatWhen(i.event.startsAt)} · {i.event.business.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function RequestsSection({ requests }: { requests: Activity["connectionRequests"] }) {
  if (requests.length === 0) return null;
  return (
    <Section id="requests" title="Connection requests">
      <ul className={s.list}>
        {requests.map((r) => (
          <li key={r.id} className={`${s.card} ${s.spread}`}>
            <span className={s.row}><Avatar name={r.requester?.displayName ?? "?"} src={r.requester?.avatarUrl} /> {r.requester?.displayName ?? "Someone"}</span>
            <Link href="/match?tab=requests">Respond</Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function PastSection({ events }: { events: Activity["past"] }) {
  if (events.length === 0) return null;
  return (
    <Section id="past" title="Past events">
      <ul className={s.list}>
        {events.map((e) => (
          <li key={e.id} className={s.section}>
            <EventCard event={e} />
            {!e.feedbackGiven && e.status === "completed" ? <Link href={`/events/${e.id}`} className={s.meta}>Leave feedback and reconnect</Link> : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function NotificationsSection({ notifications }: { notifications: Activity["notifications"] }) {
  return (
    <Section id="notifications" title="Notifications">
      {notifications.length === 0 ? (
        <div className={s.card}><EmptyState icon={<Bell size={20} aria-hidden />} title="You're all caught up." /></div>
      ) : (
        <ul className={`${s.list} ${s.card}`}>
          {notifications.map((n) => (
            <li key={n.id} className={s.spread}>
              <span>{NOTIFICATION_TEXT[n.type] ?? n.type}</span>
              <span className={s.row}>
                {n.readAt ? null : <Pill tone="brand">New</Pill>}
                <span className={s.meta}>{formatWhen(n.createdAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
