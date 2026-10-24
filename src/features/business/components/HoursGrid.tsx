'use client';

import { Input } from '@/features/core/components/ui';
import type { WeekdayKey, WeeklyHours } from '@/shared/types';
import { WEEKDAYS } from '../schemas';

/** One open/close window per day, which is all the demo venues need. */

const DAY_LABEL: Record<WeekdayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export function HoursGrid({
  hours,
  onChange,
}: {
  hours: WeeklyHours;
  onChange: (next: WeeklyHours) => void;
}) {
  const setDay = (day: WeekdayKey, open: string, close: string) => {
    if (!open || !close) {
      const { [day]: _removed, ...rest } = hours;
      onChange(rest);
      return;
    }
    onChange({ ...hours, [day]: [[open, close]] });
  };

  return (
    <ul className="flex flex-col divide-y divide-border-subtle">
      {WEEKDAYS.map((day) => {
        const window = hours[day]?.[0];
        const open = window?.[0] ?? '';
        const close = window?.[1] ?? '';
        const closed = !window;

        return (
          <li key={day} className="flex flex-wrap items-center gap-3 py-2.5">
            <span className="w-24 text-base font-medium">{DAY_LABEL[day]}</span>
            <Input
              aria-label={`${DAY_LABEL[day]} opens`}
              type="time"
              value={open}
              className="w-32"
              onChange={(event) => setDay(day, event.target.value, close || '21:00')}
            />
            <span aria-hidden className="text-text-2">
              to
            </span>
            <Input
              aria-label={`${DAY_LABEL[day]} closes`}
              type="time"
              value={close}
              className="w-32"
              onChange={(event) => setDay(day, open || '09:00', event.target.value)}
            />
            {closed ? (
              <span className="text-sm text-text-3">Closed</span>
            ) : (
              <button
                type="button"
                className="text-sm font-medium text-brand hover:underline"
                onClick={() => setDay(day, '', '')}
              >
                Mark closed
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
