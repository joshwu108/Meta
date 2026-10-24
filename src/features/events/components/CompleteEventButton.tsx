"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { send } from "./api";
import { Button } from "./ui";
import s from "./events.module.css";

/** Venue / demo-operator control that ends the event and opens feedback and reconnect. */
export function CompleteEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const complete = () =>
    startTransition(async () => {
      try {
        await send(`/api/events/${eventId}/complete`, "PATCH");
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  return (
    <div className={s.row}>
      <Button variant="secondary" disabled={pending} onClick={complete}>Mark event completed</Button>
      {error ? <p className={s.error} role="alert">{error}</p> : null}
    </div>
  );
}
