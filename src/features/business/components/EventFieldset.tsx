'use client';

import { Input } from '@/features/core/components/ui';
import { EVENT_CATEGORY, type EventCategory } from '@/shared/enums';
import { CATEGORY_LABEL } from '../labels';
import { Select, Textarea } from './form';
import { timezoneLabel } from '../format';
import type { EventDraft } from './event-draft';

export { centsToPrice, priceToCents, type EventDraft } from './event-draft';

/**
 * The editable shape of an event, shared by "Edit & approve" on a proposal and by the
 * event editor (spec section 7, Screens 3 and 4).
 */


export function EventFieldset({
  draft,
  onChange,
  errors,
  lockCategory = false,
  capacityCeiling,
}: {
  draft: EventDraft;
  onChange: (next: EventDraft) => void;
  errors: Record<string, string>;
  lockCategory?: boolean;
  capacityCeiling: number;
}) {
  // Times are the venue's wall clock, not the owner's, so say which zone they are in.
  const zone = timezoneLabel();
  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="flex flex-col gap-4">
      <Input
        id="event-title"
        label="Title"
        error={errors.title}
        value={draft.title}
        maxLength={80}
        onChange={(event) => set('title', event.target.value)}
      />

      <Textarea
        id="event-description"
        label="Description"
        error={errors.description}
        value={draft.description}
        maxLength={1500}
        onChange={(event) => set('description', event.target.value)}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          id="event-category"
          label="Category"
          error={errors.category}
          value={draft.category}
          disabled={lockCategory}
          onChange={(event) => set('category', event.target.value as EventCategory)}
        >
          {EVENT_CATEGORY.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABEL[category]}
            </option>
          ))}
        </Select>

        <Input
          id="event-format"
          label="Format"
          hint="How the evening runs, in one line."
          value={draft.format}
          maxLength={200}
          onChange={(event) => set('format', event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          id="event-starts"
          label="Starts"
          type="datetime-local"
          hint={`Venue time (${zone})`}
          error={errors.startsAt}
          value={draft.startsAtLocal}
          onChange={(event) => set('startsAtLocal', event.target.value)}
        />
        <Input
          id="event-ends"
          label="Ends"
          type="datetime-local"
          hint={`Venue time (${zone})`}
          error={errors.endsAt}
          value={draft.endsAtLocal}
          onChange={(event) => set('endsAtLocal', event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          id="event-capacity"
          label="Capacity"
          type="number"
          inputMode="numeric"
          min={1}
          max={500}
          error={errors.capacity}
          hint={`Your venue is set up for up to ${capacityCeiling}.`}
          value={draft.capacity}
          onChange={(event) => set('capacity', Number(event.target.value))}
        />
        <Input
          id="event-price"
          label="Price"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.5"
          placeholder="25"
          error={errors.priceCents}
          hint="Leave empty for free or pay at the venue."
          value={draft.priceDollars}
          onChange={(event) => set('priceDollars', event.target.value)}
        />
      </div>
    </div>
  );
}

