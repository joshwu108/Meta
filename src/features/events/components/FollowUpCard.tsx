"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FollowUpStatus, FollowUpView } from "../server/follow-ups";
import { apiPatch } from "@/lib/api/client";
import { SLOT_PHRASES } from "./format";
import { AiTag, Avatar, Button } from "@/features/core/components/ui";
import s from "./events.module.css";

export function FollowUpCard({ followUp }: { followUp: FollowUpView }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /**
   * What the server said when this card was last acted on. `router.refresh()` re-fetches the page
   * for the rest of Activity, but on a production build the refreshed payload does not reach this
   * card — the buttons sit disabled until the member reloads by hand, which `next dev` hid because
   * it re-renders on every request. The PATCH already answers with the new status, so the card
   * renders from that and the refresh becomes a background sync rather than the thing it waits on.
   */
  const [answered, setAnswered] = useState<{ status: FollowUpStatus; iAccepted: boolean } | null>(null);
  const other = followUp.otherUser?.displayName ?? "your match";
  const status = answered?.status ?? followUp.status;
  const iAccepted = answered?.iAccepted ?? followUp.iAccepted;
  const where = followUp.businessName ? ` at ${followUp.businessName}` : "";
  const respond = (action: "accept" | "dismiss") =>
    startTransition(async () => {
      try {
        const next = await apiPatch<{ status: FollowUpStatus }>(`/api/follow-ups/${followUp.id}`, { action });
        setAnswered({ status: next.status, iAccepted: action === "accept" });
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });

  return (
    <article className={s.card}>
      <div className={s.spread}>
        <span className={s.row}>
          <Avatar name={other} src={followUp.otherUser?.avatarUrl} /> <strong>{other}</strong>
        </span>
        <AiTag />
      </div>
      <p style={{ margin: 0 }}>
        Your agents suggest: <strong>{followUp.suggestion.title}{where}</strong>, {SLOT_PHRASES[followUp.suggestion.suggestedSlot]}
      </p>
      <p className={s.meta}>{followUp.suggestion.description} After {followUp.eventTitle}.</p>
      {status === "accepted_both" ? (
        <p className={s.meta}>You&apos;re both in. Say hi to {other}!</p>
      ) : iAccepted ? (
        <p className={s.meta}>Waiting for {other}</p>
      ) : (
        <div className={s.row}>
          <Button disabled={pending} onClick={() => respond("accept")}>Accept</Button>
          <Button variant="secondary" disabled={pending} onClick={() => respond("dismiss")}>Dismiss</Button>
        </div>
      )}
      {error ? <p className={s.error} role="alert">{error}</p> : null}
    </article>
  );
}
