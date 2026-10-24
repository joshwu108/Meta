'use client';

import { CardHeader, Input } from '@/features/core/components/ui';
import { Select } from '../form';
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
      <Input label="Address" error={errors.address} id="venue-address" value={draft.address} onChange={(e) => set('address', e.target.value)} />
      <Select label="Neighborhood" hint="We guess it from the address; pick one to override." id="venue-neighborhood"
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
      <div>
        <h3 className="mb-1 text-sm font-medium">Weekly hours</h3>
        <HoursGrid hours={draft.hours} onChange={(hours) => set('hours', hours)} />
      </div>
    </>
  );
}
