'use client';

import { CardHeader, Input } from '@/features/core/components/ui';
import { Select, Textarea } from '../form';
import { EVENT_CATEGORY, type EventCategory } from '@/shared/enums';
import { CATEGORY_LABEL } from '../../labels';
import type { StepProps } from './draft';

export function ProfileStep({ draft, set, errors }: StepProps) {
  return (
    <>
      <CardHeader title="Profile" subtitle="How people will see your venue." />
      <Input label="Venue name" error={errors.name} id="venue-name" value={draft.name} onChange={(e) => set('name', e.target.value)} />
      <Textarea label="Description" hint="A sentence or two." id="venue-description"
          value={draft.description}
          maxLength={1000}
          onChange={(e) => set('description', e.target.value)} />
      <Select label="Primary category" id="venue-category"
          value={draft.category}
          onChange={(e) => set('category', e.target.value as EventCategory)}
        >
          {EVENT_CATEGORY.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABEL[category]}
            </option>
          ))}
        </Select>
      <Input label="Image URL" hint="Optional. A 16:9 photo looks best." id="venue-image" value={draft.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} />
    </>
  );
}
