import { ButtonLink, CapacityMeter, StatusPill } from '@/features/core/components/ui';
import type { BusinessEvent } from '@/shared/types';
import { AiTag } from '@/features/core/components/ui';
import { CATEGORY_LABEL, STATUS_LABEL, STATUS_TONE } from '../labels';
import { formatDateTime, formatPrice } from '../format';

/** One 56px+ table row in the events list (design-system.md section 3, density). */
export function EventListRow({ event }: { event: BusinessEvent }) {
  return (
    <li className="flex flex-col gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={STATUS_TONE[event.status]}>{STATUS_LABEL[event.status]}</StatusPill>
          {event.source === 'ai_proposal' ? <AiTag label="AI suggestion" /> : null}
        </div>
        <p className="mt-1.5 truncate text-base font-semibold">{event.title}</p>
        <p className="mt-0.5 text-sm text-text-2">
          {formatDateTime(event.startsAt)} · {CATEGORY_LABEL[event.category]} · {formatPrice(event.priceCents)}
        </p>
      </div>

      <div className="w-full sm:w-40">
        <CapacityMeter confirmed={event.confirmedCount} capacity={event.capacity} />
      </div>

      <div className="flex shrink-0 gap-2">
        <ButtonLink href={`/business/events/${event.id}/edit`} variant="secondary">
          Edit
        </ButtonLink>
        <ButtonLink href={`/business/events/${event.id}/attendees`} variant="ghost">
          Attendees
        </ButtonLink>
      </div>
    </li>
  );
}
