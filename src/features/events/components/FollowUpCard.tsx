"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FollowUpView } from "../server/follow-ups";
import { send } from "./api";
import { SLOT_PHRASES } from "./format";
import { AiTag, Avatar, Button } from "./ui";
import s from "./events.module.css";

export function FollowUpCard({ followUp }: { followUp: FollowUpView }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const other = followUp.otherUser?.displayName ?? "your match";
  const where = followUp.businessName ? ` at ${followUp.businessName}` : "";
  const respond = (action: "accept" | "dismiss") =>
    startTransition(async () => {
      try {
        await send(`/api/follow-ups/${followUp.id}`, "PATCH", { action });
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
      {followUp.status === "accepted_both" ? (
        <p className={s.meta}>You&apos;re both in. Say hi to {other}!</p>
      ) : followUp.iAccepted ? (
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
