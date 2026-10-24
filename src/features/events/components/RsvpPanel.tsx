"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { send } from "./api";
import { Button, Switch } from "./ui";
import s from "./events.module.css";

type Props = {
  eventId: string;
  status: string;
  rsvpStatus: string | null;
  defaults: { shareWithAttendees: boolean; shareWithBusiness: boolean };
};

/** RSVP / cancel with the first-RSVP consent sheet, prefilled from the user's agent permissions. */
export function RsvpPanel({ eventId, status, rsvpStatus, defaults }: Props) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shareWithAttendees, setShareAttendees] = useState(defaults.shareWithAttendees);
  const [shareWithBusiness, setShareBusiness] = useState(defaults.shareWithBusiness);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
    return (
      <div className={s.row}>
        <Button variant="secondary" disabled={pending} onClick={() => run(() => send(`/api/events/${eventId}/rsvp`, "DELETE"))}>
          Cancel RSVP
        </Button>
        {error ? <p className={s.error} role="alert">{error}</p> : null}
      </div>
    );
  }
  if (status !== "published") {
    return <Button size="lg" disabled>{status === "full" ? "Event is full" : "RSVPs closed"}</Button>;
  }

  return (
    <>
      <Button size="lg" onClick={() => setSheetOpen(true)}>RSVP</Button>
      {error && !sheetOpen ? <p className={s.error} role="alert">{error}</p> : null}
      {sheetOpen ? (
        <div className={s.sheetBackdrop} onClick={() => setSheetOpen(false)}>
          <div className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="rsvp-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="rsvp-title" className={s.sectionTitle}>Before you RSVP</h2>
            <Switch label="Share my name with other attendees" checked={shareWithAttendees} onChange={setShareAttendees} />
            <Switch label="Share my name with the venue" checked={shareWithBusiness} onChange={setShareBusiness} />
            <p className={s.meta}>You can change this by cancelling and RSVPing again.</p>
            {error ? <p className={s.error} role="alert">{error}</p> : null}
            <div className={s.row}>
              <Button size="lg" disabled={pending} onClick={() => run(() => send(`/api/events/${eventId}/rsvp`, "POST", { shareWithAttendees, shareWithBusiness }))}>
                Confirm RSVP
              </Button>
              <Button variant="ghost" onClick={() => setSheetOpen(false)}>Not now</Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
