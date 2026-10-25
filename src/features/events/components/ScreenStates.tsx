"use client";

import { AlertTriangle, CalendarX } from "lucide-react";
import Link from "next/link";
import { Button, EmptyState } from "@/features/core/components/ui";
import s from "./events.module.css";

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
