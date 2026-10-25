"use client";
import { ScreenError } from "@/features/events/components/ScreenStates";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <ScreenError title="We couldn't load events." reset={reset} />;
}
