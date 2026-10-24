"use client";

import { useState, useTransition } from "react";
import type { AttendeeView } from "../server/visibility";
import { apiPost } from "@/lib/api/client";
import { Avatar, Button } from "@/features/core/components/ui";
import s from "./events.module.css";

/** "Who would you like to see again?" Only named attendees can be picked; nobody is told unless it is mutual. */
export function ReconnectList({ eventId, attendees }: { eventId: string; attendees: AttendeeView[] }) {
  const [chosen, setChosen] = useState<Record<string, "sent" | "mutual">>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const named = attendees.filter((a): a is AttendeeView & { userId: string; displayName: string } => Boolean(a.userId && a.displayName));

  if (named.length === 0) return <p className={s.meta}>No attendees shared their name at this event.</p>;

  const pick = (userId: string) =>
    startTransition(async () => {
      try {
        const res = await apiPost<{ mutual: boolean }>(`/api/events/${eventId}/reconnect`, { toUserId: userId });
        setChosen((prev) => ({ ...prev, [userId]: res.mutual ? "mutual" : "sent" }));
      } catch (err) {
        setError((err as Error).message);
      }
    });

  return (
    <div className={s.section}>
      <p className={s.meta}>They only find out if they pick you too.</p>
      <ul className={s.list}>
        {named.map((a) => (
          <li key={a.userId} className={s.spread}>
            <span className={s.row}><Avatar name={a.displayName} src={a.avatarUrl} /> {a.displayName}</span>
            {chosen[a.userId] ? (
              <span className={s.meta}>{chosen[a.userId] === "mutual" ? "It's mutual! Check Activity." : "Noted"}</span>
            ) : (
              <Button variant="secondary" disabled={pending} onClick={() => pick(a.userId)}>See again</Button>
            )}
          </li>
        ))}
      </ul>
      {error ? <p className={s.error} role="alert">{error}</p> : null}
    </div>
  );
}
