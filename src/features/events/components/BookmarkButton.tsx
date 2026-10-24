"use client";

import { Bookmark } from "lucide-react";
import { useState, useTransition } from "react";
import { send } from "./api";
import { Button } from "./ui";

export function BookmarkButton({ eventId, initial }: { eventId: string; initial: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  const toggle = () =>
    startTransition(async () => {
      const next = !saved;
      setSaved(next);
      try {
        await send(`/api/events/${eventId}/bookmark`, next ? "POST" : "DELETE");
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
