"use client";

import { useEffect, useState } from "react";
import { send } from "./api";
import { Button, Switch } from "./ui";
import s from "./events.module.css";

type Choices = { shareWithAttendees: boolean; shareWithBusiness: boolean };
type Consent = { share_interests_with_attendees?: boolean; share_name_with_business?: boolean };

type Props = {
  title: string;
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: (choices: Choices) => void;
  onClose: () => void;
};

/**
 * Sharing choices shown before an RSVP, prefilled from the agent's permissions (02's
 * GET /api/agent/permissions). Both start off and stay off if the permissions cannot be read.
 */
export function ConsentSheet({ title, confirmLabel, pending, error, onConfirm, onClose }: Props) {
  const [shareWithAttendees, setShareAttendees] = useState(false);
  const [shareWithBusiness, setShareBusiness] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    let active = true;
    send<Consent>("/api/agent/permissions", "GET")
      .then((consent) => {
        if (!active || touched) return;
        setShareAttendees(consent.share_interests_with_attendees === true);
        setShareBusiness(consent.share_name_with_business === true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [touched]);

  const choose = (set: (v: boolean) => void) => (v: boolean) => {
    setTouched(true);
    set(v);
  };

  return (
    <div className={s.sheetBackdrop} onClick={onClose}>
      <div className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="rsvp-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="rsvp-title" className={s.sectionTitle}>{title}</h2>
        <Switch label="Share my name with other attendees" checked={shareWithAttendees} onChange={choose(setShareAttendees)} />
        <Switch label="Share my name with the venue" checked={shareWithBusiness} onChange={choose(setShareBusiness)} />
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
