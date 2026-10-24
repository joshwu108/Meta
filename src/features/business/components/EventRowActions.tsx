'use client';

import { Button, ButtonLink } from '@/features/core/components/ui';
import { apiPost } from '@/lib/api/client';
import type { BusinessEvent } from '@/shared/types';
import { isCancellable } from '../status-machine-client';
import { useSubmit } from './use-submit';

/**
 * Spec section 7, Screen 5: "actions (edit, publish, cancel)" on each row.
 *
 * Publish happens in place, because it needs no extra input. Cancel always needs a reason,
 * so it opens the editor with the cancel panel already expanded rather than inventing a
 * second place to type one.
 */
export function EventRowActions({ event }: { event: BusinessEvent }) {
  const { busy, message, submit, navigate } = useSubmit();

  const publish = () =>
    submit(
      () => apiPost(`/api/business/events/${event.id}/publish`),
      () => navigate('/business/events'),
    );

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex flex-wrap gap-2">
        {event.status === 'approved_draft' ? (
          <Button onClick={publish} disabled={busy}>
            Publish
          </Button>
        ) : null}
        <ButtonLink href={`/business/events/${event.id}/edit`} variant="secondary">
          Edit
        </ButtonLink>
        <ButtonLink href={`/business/events/${event.id}/attendees`} variant="ghost">
          Attendees
        </ButtonLink>
        {isCancellable(event.status) ? (
          <ButtonLink href={`/business/events/${event.id}/edit?cancel=1`} variant="ghost">
            Cancel
          </ButtonLink>
        ) : null}
      </div>
      {message ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}
