"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { apiPatch } from "@/lib/api/client";
import { Button } from "@/features/core/components/ui";
import s from "./events.module.css";

/** Venue / demo-operator control that ends the event and opens feedback and reconnect. */
export function CompleteEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const complete = () =>
    startTransition(async () => {
      try {
        await apiPatch(`/api/events/${eventId}/complete`);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  if (!confirming) {
    return (
      <div className={s.row}>
        <Button variant="secondary" onClick={() => setConfirming(true)}>Mark event completed</Button>
      </div>
    );
  }
  // One click would end the event for every attendee, so ask first.
  return (
    <div className={s.field}>
      <p className={s.meta}>End this event for everyone? RSVPs close and attendees can leave feedback.</p>
      <div className={s.row}>
        <Button variant="danger" disabled={pending} onClick={complete}>Yes, mark completed</Button>
        <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>Keep it open</Button>
      </div>
      {error ? <p className={s.error} role="alert">{error}</p> : null}
    </div>
  );
}
