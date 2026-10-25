'use client';

import { CardHeader } from '@/features/core/components/ui';
import { formatPriceRange } from '../../format';
import { CATEGORY_LABEL, SLOT_LABEL } from '../../labels';
import { dollarsToCents, type OnboardingDraft } from './draft';

export function ReviewStep({ draft }: { draft: OnboardingDraft }) {
  const rows = [
    { label: 'Name', value: draft.name },
    { label: 'Primary category', value: CATEGORY_LABEL[draft.category] },
    { label: 'Address', value: draft.address },
    { label: 'Neighborhood', value: draft.neighborhood || 'Guessed from the address' },
    { label: 'Capacity', value: String(draft.capacity) },
    {
      label: 'Price range',
      value: formatPriceRange(
        dollarsToCents(draft.minPriceDollars) ?? null,
        dollarsToCents(draft.maxPriceDollars) ?? null,
      ),
    },
    { label: 'Can host', value: draft.eventCategories.map((c) => CATEGORY_LABEL[c]).join(', ') },
    { label: 'When', value: draft.hostingSlots.map((s) => SLOT_LABEL[s]).join(', ') },
    { label: 'AI proposals', value: draft.acceptsAiProposals ? 'On' : 'Off' },
  ];

  return (
    <>
      <CardHeader title="Review" subtitle="Check it over, then finish." />
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-text-2">{row.label}</dt>
            <dd className="mt-0.5 font-medium">{row.value || '—'}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
