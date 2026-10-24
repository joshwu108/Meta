'use client';

import { Field, Input, Select, Textarea } from '@/features/core/components/ui';
import { EVENT_CATEGORY, type EventCategory } from '@/shared/enums';
import { CATEGORY_LABEL } from '../labels';

/**
 * The editable shape of an event, shared by "Edit & approve" on a proposal and by the
 * event editor (spec section 7, Screens 3 and 4).
 */

export type EventDraft = {
  title: string;
  description: string;
  category: EventCategory;
  format: string;
  startsAtLocal: string;
  endsAtLocal: string;
  capacity: number;
  priceDollars: string;
};

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
  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="flex flex-col gap-4">
      <Field label="Title" htmlFor="event-title" error={errors.title}>
        <Input
          id="event-title"
          value={draft.title}
          maxLength={80}
          onChange={(event) => set('title', event.target.value)}
        />
      </Field>

      <Field label="Description" htmlFor="event-description" error={errors.description}>
        <Textarea
          id="event-description"
          value={draft.description}
          maxLength={1500}
          onChange={(event) => set('description', event.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="event-category" error={errors.category}>
          <Select
            id="event-category"
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
        </Field>

        <Field label="Format" htmlFor="event-format" hint="How the evening runs, in one line.">
          <Input
            id="event-format"
            value={draft.format}
            maxLength={200}
            onChange={(event) => set('format', event.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Starts" htmlFor="event-starts" error={errors.startsAt}>
          <Input
            id="event-starts"
            type="datetime-local"
            value={draft.startsAtLocal}
            onChange={(event) => set('startsAtLocal', event.target.value)}
          />
        </Field>
        <Field label="Ends" htmlFor="event-ends" error={errors.endsAt}>
          <Input
            id="event-ends"
            type="datetime-local"
            value={draft.endsAtLocal}
            onChange={(event) => set('endsAtLocal', event.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Capacity"
          htmlFor="event-capacity"
          error={errors.capacity}
          hint={`Your venue is set up for up to ${capacityCeiling}.`}
        >
          <Input
            id="event-capacity"
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            value={draft.capacity}
            onChange={(event) => set('capacity', Number(event.target.value))}
          />
        </Field>

        <Field
          label="Price"
          htmlFor="event-price"
          error={errors.priceCents}
          hint="Leave empty for free or pay at the venue."
        >
          <Input
            id="event-price"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.5"
            placeholder="25"
            value={draft.priceDollars}
            onChange={(event) => set('priceDollars', event.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}

export const priceToCents = (dollars: string): number | null => {
  const trimmed = dollars.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
};

export const centsToPrice = (cents: number | null): string =>
  cents === null ? '' : String(cents / 100);
