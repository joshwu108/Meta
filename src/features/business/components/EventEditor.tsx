'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Card, CardFooter, CardHeader, Field, Textarea } from '@/features/core/components/ui';
import { apiPatch, apiPost } from '@/lib/api/client';
import type { BusinessEvent } from '@/shared/types';
import type { EventCategory } from '@/shared/enums';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '../format';
import {
  EventFieldset,
  centsToPrice,
  priceToCents,
  type EventDraft,
} from './EventFieldset';
import { useSubmit } from './use-submit';

/**
 * Business Screen 4 (spec section 7): the event editor, used both for a new event and for
 * editing an existing one. Publishing and cancelling go through their own routes so the
 * status machine stays on the server.
 */

const emptyDraft = (category: EventCategory): EventDraft => ({
  title: '',
  description: '',
  category,
  format: '',
  startsAtLocal: '',
  endsAtLocal: '',
  capacity: 8,
  priceDollars: '',
});

const draftOf = (event: BusinessEvent): EventDraft => ({
  title: event.title,
  description: event.description,
  category: event.category,
  format: event.format ?? '',
  startsAtLocal: toDateTimeLocalValue(event.startsAt),
  endsAtLocal: toDateTimeLocalValue(event.endsAt),
  capacity: event.capacity,
  priceDollars: centsToPrice(event.priceCents),
});

export function EventEditor({
  event,
  defaultCategory,
  capacityCeiling,
}: {
  event?: BusinessEvent;
  defaultCategory: EventCategory;
  capacityCeiling: number;
}) {
  const { busy: pending, message, errors, submit: run, navigate } = useSubmit();
  const [draft, setDraft] = useState<EventDraft>(event ? draftOf(event) : emptyDraft(defaultCategory));
  const [publishNow, setPublishNow] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  const warnsAboutReconfirm =
    event !== undefined &&
    event.confirmedCount > 0 &&
    (event.status === 'published' || event.status === 'full');


  const body = () => ({
    title: draft.title,
    description: draft.description,
    format: draft.format || undefined,
    startsAt: fromDateTimeLocalValue(draft.startsAtLocal),
    endsAt: fromDateTimeLocalValue(draft.endsAtLocal),
    capacity: draft.capacity,
    priceCents: priceToCents(draft.priceDollars),
  });

  const create = () =>
    run(
      () => apiPost('/api/business/events', { ...body(), category: draft.category, publish: publishNow }),
      () => navigate('/business/events'),
    );

  const save = () =>
    run(
      () => apiPatch(`/api/business/events/${event?.id}`, body()),
      () => navigate('/business/events'),
    );

  const publish = () =>
    run(
      () => apiPost(`/api/business/events/${event?.id}/publish`),
      () => navigate('/business/events'),
    );

  const cancel = () =>
    run(
      () => apiPost(`/api/business/events/${event?.id}/cancel`, { reason: cancelReason }),
      () => navigate('/business/events'),
    );

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-5">
        <CardHeader
          title={event ? 'Edit event' : 'New event'}
          subtitle={
            event
              ? 'Changes to the time, price or capacity ask everyone who confirmed to reconfirm.'
              : 'You can save it as a draft and publish it later.'
          }
        />

        {warnsAboutReconfirm ? (
          <p className="flex items-start gap-2 rounded-sm bg-warning-soft px-3 py-2 text-sm">
            <AlertTriangle aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            <span>
              {event.confirmedCount} {event.confirmedCount === 1 ? 'person has' : 'people have'}{' '}
              confirmed. Changing the time, price or capacity notifies them to reconfirm, and capacity
              cannot go below {event.confirmedCount}.
            </span>
          </p>
        ) : null}

        {message ? (
          <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
            {message}
          </p>
        ) : null}

        <EventFieldset
          draft={draft}
          onChange={setDraft}
          errors={errors}
          lockCategory={event !== undefined}
          capacityCeiling={capacityCeiling}
        />

        {event ? (
          <CardFooter>
            <Button onClick={save} disabled={pending}>
              Save changes
            </Button>
            {event.status === 'approved_draft' ? (
              <Button variant="secondary" onClick={publish} disabled={pending}>
                Publish
              </Button>
            ) : null}
            {event.status !== 'cancelled' && event.status !== 'completed' ? (
              <Button variant="ghost" onClick={() => setShowCancel((value) => !value)} disabled={pending}>
                Cancel event
              </Button>
            ) : null}
          </CardFooter>
        ) : (
          <CardFooter>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-brand)]"
                checked={publishNow}
                onChange={(input) => setPublishNow(input.target.checked)}
              />
              Publish immediately
            </label>
            <Button className="ml-auto" onClick={create} disabled={pending}>
              {publishNow ? 'Create & publish' : 'Save as draft'}
            </Button>
          </CardFooter>
        )}
      </Card>

      {event && showCancel ? (
        <Card className="flex flex-col gap-3">
          <CardHeader
            title="Cancel this event"
            subtitle="Everyone who confirmed is notified with the reason you give here."
          />
          <Field label="Reason" htmlFor="cancel-reason">
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              maxLength={500}
              onChange={(input) => setCancelReason(input.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button variant="danger" onClick={cancel} disabled={pending || cancelReason.trim().length < 4}>
              Cancel event
            </Button>
            <Button variant="ghost" onClick={() => setShowCancel(false)} disabled={pending}>
              Keep it
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
