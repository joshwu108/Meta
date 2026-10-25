'use client';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Button, Card, EmptyState } from '@/features/core/components/ui';

/** Pulsing placeholder blocks (opacity only, so reduced motion falls back to static). */
function Bone({ className }: { className: string }) {
  return <span aria-hidden className={`block animate-pulse rounded-md bg-pressed motion-reduce:animate-none ${className}`} />;
}

/** Route loading state: a lead card and a few compact rows, matching the page layout. */
export function ListSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label={label}>
      <Bone className="h-7 w-2/3" />
      <Bone className="h-4 w-1/2" />
      <Card className="flex flex-col gap-3 sm:p-5">
        <div className="flex items-center gap-3">
          <Bone className="h-14 w-14 rounded-pill" />
          <div className="flex flex-1 flex-col gap-2">
            <Bone className="h-5 w-1/2" />
            <Bone className="h-4 w-1/3" />
          </div>
        </div>
        <Bone className="h-4 w-full" />
        <Bone className="h-4 w-5/6" />
      </Card>
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} className="flex items-center gap-3">
          <Bone className="h-10 w-10 rounded-pill" />
          <div className="flex flex-1 flex-col gap-2">
            <Bone className="h-4 w-1/3" />
            <Bone className="h-4 w-3/4" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Route error state with a retry (Next passes `reset`). The message stays generic on purpose. */
export function ScreenError({ title, reset }: { title: string; reset: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={<TriangleAlert size={22} strokeWidth={1.75} aria-hidden />}
        title={title}
        action={
          <Button variant="secondary" leadingIcon={<RotateCcw size={16} aria-hidden />} onClick={reset}>
            Try again
          </Button>
        }
      />
    </Card>
  );
}
