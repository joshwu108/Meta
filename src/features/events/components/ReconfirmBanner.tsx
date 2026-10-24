"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { send } from "./api";
import { formatTime } from "./format";
import { Button } from "./ui";
import s from "./events.module.css";

/** Shown when the venue changed time or price after the user RSVP'd. */
export function ReconfirmBanner({ eventId, startsAt }: { eventId: string; startsAt: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const act = (method: "POST" | "DELETE", path: string) =>
    startTransition(async () => {
      try {
        await send(path, method);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });

  return (
    <div className={s.banner} role="status">
      <strong>The venue updated this event (new time {formatTime(startsAt)}). Still coming?</strong>
      <div className={s.row}>
        <Button disabled={pending} onClick={() => act("POST", `/api/events/${eventId}/reconfirm`)}>Reconfirm</Button>
        <Button variant="secondary" disabled={pending} onClick={() => act("DELETE", `/api/events/${eventId}/rsvp`)}>Cancel</Button>
      </div>
      {error ? <p className={s.error} role="alert">{error}</p> : null}
    </div>
  );
}
