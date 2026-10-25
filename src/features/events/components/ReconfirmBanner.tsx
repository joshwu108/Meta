"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { apiDelete, apiPost } from "@/lib/api/client";
import { formatTime } from "./format";
import { Button } from "@/features/core/components/ui";
import s from "./events.module.css";

/** Shown when the venue changed time or price after the user RSVP'd. */
export function ReconfirmBanner({ eventId, startsAt }: { eventId: string; startsAt: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const act = (request: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        await request();
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });

  return (
    <div className={s.banner} role="status">
      <strong>The venue updated this event (new time {formatTime(startsAt)}). Still coming?</strong>
      <div className={s.row}>
        <Button disabled={pending} onClick={() => act(() => apiPost(`/api/events/${eventId}/reconfirm`))}>Reconfirm</Button>
        <Button variant="secondary" disabled={pending} onClick={() => act(() => apiDelete(`/api/events/${eventId}/rsvp`))}>Cancel</Button>
      </div>
      {error ? <p className={s.error} role="alert">{error}</p> : null}
    </div>
  );
}
