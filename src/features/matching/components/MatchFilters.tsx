'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useId } from 'react';
import { Chip } from '@/features/core/components/ui';
import { SOCIAL_GOAL, type SocialGoal } from '@/shared/enums';
import { chipLabel } from '@/shared/labels';
import { SOCIAL_GOAL_LABELS } from '../labels';

export type MatchFilterState = { interest?: string; goal?: SocialGoal; interestOptions: string[] };

/** P1 filters on /match: one interest chip and one social goal, kept in the URL. */
export function MatchFilters({ filters }: { filters: MatchFilterState }) {
  const router = useRouter();
  const pathname = usePathname();
  const goalId = useId();
  const go = (next: { interest?: string; goal?: string }) => {
    const params = new URLSearchParams();
    if (next.interest) params.set('interest', next.interest);
    if (next.goal) params.set('goal', next.goal);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };
  if (filters.interestOptions.length === 0 && !filters.interest && !filters.goal) return null;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <ul className="flex flex-wrap gap-1.5" aria-label="Filter by interest">
        <li>
          <Chip selected={!filters.interest} onSelect={() => go({ goal: filters.goal })}>
            All
          </Chip>
        </li>
        {filters.interestOptions.map((value) => (
          <li key={value}>
            <Chip selected={filters.interest === value} onSelect={() => go({ interest: filters.interest === value ? undefined : value, goal: filters.goal })}>
              {chipLabel(value)}
            </Chip>
          </li>
        ))}
      </ul>
      <label htmlFor={goalId} className="flex items-center gap-2 text-[length:var(--text-sm)] text-text-2">
        Looking to
        <select
          id={goalId}
          value={filters.goal ?? ''}
          onChange={(event) => go({ interest: filters.interest, goal: event.target.value || undefined })}
          className="h-9 rounded-sm border border-divider bg-surface px-2 text-text focus:border-brand focus:outline-none"
        >
          <option value="">Any goal</option>
          {SOCIAL_GOAL.map((goal) => (
            <option key={goal} value={goal}>
              {SOCIAL_GOAL_LABELS[goal]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
