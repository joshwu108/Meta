"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api/client";
import { Button, Sheet, Switch } from "@/features/core/components/ui";
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
 * Sharing choices shown before an RSVP in 01's Sheet (Escape closes, focus returns to the trigger),
 * prefilled from the agent's permissions (02's GET /api/agent/permissions). Both start off and stay
 * off if the permissions cannot be read.
 */
export function ConsentSheet({ title, confirmLabel, pending, error, onConfirm, onClose }: Props) {
  const [shareWithAttendees, setShareAttendees] = useState(false);
  const [shareWithBusiness, setShareBusiness] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    let active = true;
    apiGet<Consent>("/api/agent/permissions")
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
    <Sheet
      isOpen
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Not now</Button>
          <Button disabled={pending} onClick={() => onConfirm({ shareWithAttendees, shareWithBusiness })}>{confirmLabel}</Button>
        </>
      }
    >
      <Switch label="Share my name with other attendees" checked={shareWithAttendees} onChange={choose(setShareAttendees)} />
      <Switch label="Share my name with the venue" checked={shareWithBusiness} onChange={choose(setShareBusiness)} />
      <p className={s.meta}>You can change this by cancelling and RSVPing again.</p>
      {error ? <p className={s.error} role="alert">{error}</p> : null}
    </Sheet>
  );
}
