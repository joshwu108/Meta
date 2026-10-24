"use client";

import { useState } from "react";
import { Button, Switch } from "./ui";
import s from "./events.module.css";

type Choices = { shareWithAttendees: boolean; shareWithBusiness: boolean };

type Props = {
  title: string;
  confirmLabel: string;
  defaults: Choices;
  pending: boolean;
  error: string | null;
  onConfirm: (choices: Choices) => void;
  onClose: () => void;
};

/** Sharing choices shown before an RSVP; prefilled from the agent's permissions. */
export function ConsentSheet({ title, confirmLabel, defaults, pending, error, onConfirm, onClose }: Props) {
  const [shareWithAttendees, setShareAttendees] = useState(defaults.shareWithAttendees);
  const [shareWithBusiness, setShareBusiness] = useState(defaults.shareWithBusiness);
  return (
    <div className={s.sheetBackdrop} onClick={onClose}>
      <div className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="rsvp-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="rsvp-title" className={s.sectionTitle}>{title}</h2>
        <Switch label="Share my name with other attendees" checked={shareWithAttendees} onChange={setShareAttendees} />
        <Switch label="Share my name with the venue" checked={shareWithBusiness} onChange={setShareBusiness} />
        <p className={s.meta}>You can change this by cancelling and RSVPing again.</p>
        {error ? <p className={s.error} role="alert">{error}</p> : null}
        <div className={s.row}>
          <Button size="lg" disabled={pending} onClick={() => onConfirm({ shareWithAttendees, shareWithBusiness })}>{confirmLabel}</Button>
          <Button variant="ghost" onClick={onClose}>Not now</Button>
        </div>
      </div>
    </div>
  );
}
