'use client';

import { CardHeader, Input, Switch } from '@/features/core/components/ui';
import { Field, Textarea } from '../form';
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
      <Field label="Event categories you can host">
        <ChipMultiSelect
          options={EVENT_CATEGORY}
          selected={draft.eventCategories}
          onChange={(next) => set('eventCategories', next)}
          labelOf={(value) => CATEGORY_LABEL[value]}
        />
      </Field>
      <Input label="Capacity" error={errors.capacity} id="venue-capacity"
          type="number"
          min={1}
          max={500}
          value={draft.capacity}
          onChange={(e) => set('capacity', Number(e.target.value))} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Lowest ticket price" hint="In dollars. Leave empty for free events." id="venue-min-price"
            type="number"
            min={0}
            step="0.5"
            value={draft.minPriceDollars}
            onChange={(e) => set('minPriceDollars', e.target.value)} />
        <Input label="Highest ticket price" error={errors.maxPriceCents} id="venue-max-price"
            type="number"
            min={0}
            step="0.5"
            value={draft.maxPriceDollars}
            onChange={(e) => set('maxPriceDollars', e.target.value)} />
      </div>
      <Field label="When you can host">
        <ChipMultiSelect
          options={AVAILABILITY_SLOT}
          selected={draft.hostingSlots}
          onChange={(next) => set('hostingSlots', next)}
          labelOf={(value) => SLOT_LABEL[value]}
        />
      </Field>
      <Field label="Equipment" hint="Comma separated, e.g. pottery-wheels, kiln">
        <TagList
          value={draft.equipmentTags}
          onChange={(next) => set('equipmentTags', next)}
          placeholder="pottery-wheels, kiln"
        />
      </Field>
      <Field label="Formats" hint="Comma separated, e.g. workshop, social-mixer">
        <TagList
          value={draft.formats}
          onChange={(next) => set('formats', next)}
          placeholder="workshop, tasting"
        />
      </Field>
      <Textarea label="Anything else we should know" id="venue-notes"
          value={draft.notes}
          maxLength={500}
          onChange={(e) => set('notes', e.target.value)} />
      <Switch
        checked={draft.acceptsAiProposals}
        onChange={(next) => set('acceptsAiProposals', next)}
        label="Accept AI event proposals"
        description="We suggest events based on aggregated local interest. You approve, edit or reject every one; nothing is published without you."
      />
    </>
  );
}
