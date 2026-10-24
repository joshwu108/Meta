'use client';

import { CardHeader, Field, Input, Switch, Textarea } from '@/features/core/components/ui';
import { AVAILABILITY_SLOT, EVENT_CATEGORY } from '@/shared/enums';
import { CATEGORY_LABEL, SLOT_LABEL } from '../../labels';
import { ChipMultiSelect, TagList } from '../ChipMultiSelect';
import type { StepProps } from './draft';

export function CapabilitiesStep({ draft, set, errors }: StepProps) {
  return (
    <>
      <CardHeader
        title="What you can host"
        subtitle="This is what event suggestions are matched against."
      />
      <Field label="Event categories you can host" htmlFor="">
        <ChipMultiSelect
          options={EVENT_CATEGORY}
          selected={draft.eventCategories}
          onChange={(next) => set('eventCategories', next)}
          labelOf={(value) => CATEGORY_LABEL[value]}
        />
      </Field>
      <Field label="Capacity" htmlFor="venue-capacity" error={errors.capacity}>
        <Input
          id="venue-capacity"
          type="number"
          min={1}
          max={500}
          value={draft.capacity}
          onChange={(e) => set('capacity', Number(e.target.value))}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Lowest ticket price"
          htmlFor="venue-min-price"
          hint="In dollars. Leave empty for free events."
        >
          <Input
            id="venue-min-price"
            type="number"
            min={0}
            step="0.5"
            value={draft.minPriceDollars}
            onChange={(e) => set('minPriceDollars', e.target.value)}
          />
        </Field>
        <Field label="Highest ticket price" htmlFor="venue-max-price" error={errors.maxPriceCents}>
          <Input
            id="venue-max-price"
            type="number"
            min={0}
            step="0.5"
            value={draft.maxPriceDollars}
            onChange={(e) => set('maxPriceDollars', e.target.value)}
          />
        </Field>
      </div>
      <Field label="When you can host" htmlFor="">
        <ChipMultiSelect
          options={AVAILABILITY_SLOT}
          selected={draft.hostingSlots}
          onChange={(next) => set('hostingSlots', next)}
          labelOf={(value) => SLOT_LABEL[value]}
        />
      </Field>
      <Field label="Equipment" htmlFor="" hint="Comma separated, e.g. pottery-wheels, kiln">
        <TagList
          value={draft.equipmentTags}
          onChange={(next) => set('equipmentTags', next)}
          placeholder="pottery-wheels, kiln"
        />
      </Field>
      <Field label="Formats" htmlFor="" hint="Comma separated, e.g. workshop, social-mixer">
        <TagList
          value={draft.formats}
          onChange={(next) => set('formats', next)}
          placeholder="workshop, tasting"
        />
      </Field>
      <Field label="Anything else we should know" htmlFor="venue-notes">
        <Textarea
          id="venue-notes"
          value={draft.notes}
          maxLength={500}
          onChange={(e) => set('notes', e.target.value)}
        />
      </Field>
      <Switch
        checked={draft.acceptsAiProposals}
        onChange={(next) => set('acceptsAiProposals', next)}
        label="Accept AI event proposals"
        description="We suggest events based on aggregated local interest. You approve, edit or reject every one; nothing is published without you."
      />
    </>
  );
}
