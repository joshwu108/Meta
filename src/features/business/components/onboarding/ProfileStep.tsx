'use client';

import { CardHeader, Field, Input, Select, Textarea } from '@/features/core/components/ui';
import { EVENT_CATEGORY, type EventCategory } from '@/shared/enums';
import { CATEGORY_LABEL } from '../../labels';
import type { StepProps } from './draft';

export function ProfileStep({ draft, set, errors }: StepProps) {
  return (
    <>
      <CardHeader title="Profile" subtitle="How people will see your venue." />
      <Field label="Venue name" htmlFor="venue-name" error={errors.name}>
        <Input id="venue-name" value={draft.name} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label="Description" htmlFor="venue-description" hint="A sentence or two.">
        <Textarea
          id="venue-description"
          value={draft.description}
          maxLength={1000}
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>
      <Field label="Primary category" htmlFor="venue-category">
        <Select
          id="venue-category"
          value={draft.category}
          onChange={(e) => set('category', e.target.value as EventCategory)}
        >
          {EVENT_CATEGORY.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABEL[category]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Image URL" htmlFor="venue-image" hint="Optional. A 16:9 photo looks best.">
        <Input id="venue-image" value={draft.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} />
      </Field>
    </>
  );
}
