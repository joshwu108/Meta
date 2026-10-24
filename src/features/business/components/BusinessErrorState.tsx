'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, ButtonLink, Card } from '@/features/core/components/ui';

/**
 * The route-level error boundary's body. A business owner is mid-decision when this
 * appears, so it says what is safe to assume (nothing was published) and offers one
 * action, rather than showing a stack trace.
 */
export function BusinessErrorState({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The message is already logged server-side with a request id; this ties the two up.
    console.error('[ws05] business screen failed', { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] items-center px-4">
      <Card className="flex w-full flex-col gap-4">
        <span className="inline-flex size-10 items-center justify-center rounded-pill bg-danger-soft text-danger">
          <AlertTriangle aria-hidden size={20} strokeWidth={1.75} />
        </span>

        <div>
          <h1 className="text-lg font-semibold leading-tight">This page could not load</h1>
          <p className="mt-1.5 text-base text-text-2">
            Nothing was changed and nothing was published. Try again, and if it keeps happening your
            events and proposals are all still safe on the dashboard.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/business" variant="secondary">
            Back to dashboard
          </ButtonLink>
        </div>

        {error.digest ? (
          <p className="text-xs text-text-3">
            Reference <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
      </Card>
    </div>
  );
}
