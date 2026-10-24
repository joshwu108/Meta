"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { send } from "./api";
import { ConsentSheet } from "./ConsentSheet";
import { Button } from "./ui";
import s from "./events.module.css";

type Props = {
  eventId: string;
  status: string;
  rsvpStatus: string | null;
  defaults: { shareWithAttendees: boolean; shareWithBusiness: boolean };
  waitlistEnabled: boolean;
};

/** RSVP / waitlist / cancel, with the consent sheet before every RSVP. */
export function RsvpPanel({ eventId, status, rsvpStatus, defaults, waitlistEnabled }: Props) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const path = `/api/events/${eventId}/rsvp`;

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
        setSheetOpen(false);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });

  if (rsvpStatus === "confirmed" || rsvpStatus === "waitlisted") {
    return <HeldRsvp waitlisted={rsvpStatus === "waitlisted"} pending={pending} error={error} onCancel={() => run(() => send(path, "DELETE"))} />;
  }
  const joinWaitlist = status === "full" && waitlistEnabled;
  if (status !== "published" && !joinWaitlist) {
    return <Button size="lg" disabled>{status === "full" ? "Event is full" : "RSVPs closed"}</Button>;
  }

  return (
    <>
      <Button size="lg" onClick={() => setSheetOpen(true)}>{joinWaitlist ? "Join waitlist" : "RSVP"}</Button>
      {error && !sheetOpen ? <p className={s.error} role="alert">{error}</p> : null}
      {sheetOpen ? (
        <ConsentSheet
          title={joinWaitlist ? "Before you join the waitlist" : "Before you RSVP"}
          confirmLabel={joinWaitlist ? "Join waitlist" : "Confirm RSVP"}
          defaults={defaults}
          pending={pending}
          error={error}
          onConfirm={(choices) => run(() => send(path, "POST", choices))}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </>
  );
}

function HeldRsvp({ waitlisted, pending, error, onCancel }: { waitlisted: boolean; pending: boolean; error: string | null; onCancel: () => void }) {
  return (
    <div className={s.row}>
      <Button variant="secondary" disabled={pending} onClick={onCancel}>{waitlisted ? "Leave waitlist" : "Cancel RSVP"}</Button>
      {waitlisted ? <span className={s.meta}>You&apos;re on the waitlist. We&apos;ll confirm you if a spot opens.</span> : null}
      {error ? <p className={s.error} role="alert">{error}</p> : null}
    </div>
  );
}
