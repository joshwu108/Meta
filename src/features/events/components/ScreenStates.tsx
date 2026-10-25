"use client";

import { AlertTriangle, CalendarX } from "lucide-react";
import Link from "next/link";
import { Button, EmptyState } from "@/features/core/components/ui";
import s from "./events.module.css";

/** Route-level loading state: a title bar and a few card-shaped placeholders. */
export function ListSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className={s.column} aria-busy="true" aria-live="polite">
      <span className={s.visuallyHidden}>{label}</span>
      <div className={s.skeletonTitle} />
      {Array.from({ length: rows }, (_, i) => <div key={i} className={s.skeleton} />)}
    </div>
  );
}

/** Route-level error state with a retry that re-renders the segment. */
export function ScreenError({ title, reset }: { title: string; reset: () => void }) {
  return (
    <div className={s.card} role="alert">
      <EmptyState icon={<AlertTriangle size={20} aria-hidden />} title={title} action={<Button onClick={reset}>Try again</Button>} />
    </div>
  );
}

/** Unknown, draft or deleted event. */
export function EventNotFound() {
  return (
    <div className={s.card}>
      <EmptyState icon={<CalendarX size={20} aria-hidden />} title="This event isn't available." action={<Link href="/events">Browse events</Link>} />
    </div>
  );
}
