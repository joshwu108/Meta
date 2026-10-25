import { SearchX } from 'lucide-react';
import { Card } from '@/features/core/components/ui';
import { ButtonLink } from '@/features/business/components/form';

/**
 * Reached when a page calls notFound(), which 05 does for an event or proposal that either
 * does not exist or belongs to another owner — the two are deliberately indistinguishable
 * (spec section 10, criterion 3).
 */
export default function BusinessNotFound() {
  return (
    <Card className="flex w-full max-w-[560px] flex-col gap-4">
        <span className="inline-flex size-10 items-center justify-center rounded-pill bg-surface-2 text-text-2">
          <SearchX aria-hidden size={20} strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="text-lg font-semibold leading-tight">We could not find that</h1>
          <p className="mt-1.5 text-base text-text-2">
            This event or proposal does not exist, or it belongs to another venue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/business">Back to dashboard</ButtonLink>
          <ButtonLink href="/business/events" variant="secondary">
            Your events
          </ButtonLink>
        </div>
    </Card>
  );
}
