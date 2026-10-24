'use client';

import { CardHeader, Field, Input, Select } from '@/features/core/components/ui';
import { NEIGHBORHOOD_LABELS } from '../../neighborhoods';
import { HoursGrid } from '../HoursGrid';
import type { StepProps } from './draft';

export function LocationStep({ draft, set, errors }: StepProps) {
  return (
    <>
      <CardHeader
        title="Location & hours"
        subtitle="Your address is public; your hours are used to check proposed times."
      />
      <Field label="Address" htmlFor="venue-address" error={errors.address}>
        <Input id="venue-address" value={draft.address} onChange={(e) => set('address', e.target.value)} />
      </Field>
      <Field
        label="Neighborhood"
        htmlFor="venue-neighborhood"
        hint="We guess it from the address; pick one to override."
      >
        <Select
          id="venue-neighborhood"
          value={draft.neighborhood}
          onChange={(e) => set('neighborhood', e.target.value)}
        >
          <option value="">Guess from the address</option>
          {NEIGHBORHOOD_LABELS.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <div>
        <h3 className="mb-1 text-sm font-medium">Weekly hours</h3>
        <HoursGrid hours={draft.hours} onChange={(hours) => set('hours', hours)} />
      </div>
    </>
  );
}
