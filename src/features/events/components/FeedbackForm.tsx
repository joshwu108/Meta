"use client";

import { Star } from "lucide-react";
import { useState, useTransition } from "react";
import { apiPost } from "@/lib/api/client";
import { Button, Switch } from "@/features/core/components/ui";
import s from "./events.module.css";

export function FeedbackForm({ eventId, alreadyGiven }: { eventId: string; alreadyGiven: boolean }) {
  const [rating, setRating] = useState(0);
  const [metSomeone, setMetSomeone] = useState(false);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(alreadyGiven);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) return <p className={s.meta}>Thanks for your feedback.</p>;

  const submit = () =>
    startTransition(async () => {
      try {
        await apiPost(`/api/events/${eventId}/feedback`, { rating, metSomeone, comment: comment || undefined });
        setDone(true);
      } catch (err) {
        setError((err as Error).message);
      }
    });

  return (
    <div className={s.field}>
      <span className={s.meta} id="rating-label">How was it?</span>
      <div className={s.stars} role="radiogroup" aria-labelledby="rating-label">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className={`${s.star} ${n <= rating ? s.starOn : ""}`} onClick={() => setRating(n)}>
            <Star size={24} strokeWidth={1.75} fill={n <= rating ? "currentColor" : "none"} aria-hidden />
          </button>
        ))}
      </div>
      <Switch label="I met someone new" checked={metSomeone} onChange={setMetSomeone} />
      <textarea className={s.textarea} maxLength={500} rows={3} placeholder="Anything to share with the venue? (optional)"
        value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Comment" />
      {error ? <p className={s.error} role="alert">{error}</p> : null}
      <div><Button disabled={rating === 0 || pending} onClick={submit}>Send feedback</Button></div>
    </div>
  );
}
