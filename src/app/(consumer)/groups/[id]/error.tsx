'use client';
import { ScreenError } from '@/features/matching/components/ScreenStates';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <ScreenError title="We couldn’t load this group." reset={reset} />;
}
