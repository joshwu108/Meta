"use client";

import { Bookmark } from "lucide-react";
import { useState, useTransition } from "react";
import { apiDelete, apiPost } from "@/lib/api/client";
import { Button } from "@/features/core/components/ui";

export function BookmarkButton({ eventId, initial }: { eventId: string; initial: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  const toggle = () =>
    startTransition(async () => {
      const next = !saved;
      setSaved(next);
      try {
        const url = `/api/events/${eventId}/bookmark`;
        await (next ? apiPost(url) : apiDelete(url));
      } catch {
        setSaved(!next);
      }
    });
  return (
    <Button variant="ghost" aria-pressed={saved} disabled={pending} onClick={toggle}>
      <Bookmark size={20} strokeWidth={1.75} fill={saved ? "currentColor" : "none"} aria-hidden />
      {saved ? "Saved" : "Save"}
    </Button>
  );
}
