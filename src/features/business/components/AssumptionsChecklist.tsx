'use client';

import { useState } from 'react';

/**
 * Spec section 7, Screen 3: "Assumptions to confirm" — the owner can tick them, and ticking
 * is informational only. Nothing is sent to the server, because only the owner knows
 * whether eight wheels are really free that evening.
 */
export function AssumptionsChecklist({ items }: { items: readonly string[] }) {
  const [checked, setChecked] = useState<readonly boolean[]>(items.map(() => false));

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, index) => (
        <li key={item}>
          <label className="flex cursor-pointer items-start gap-2.5 text-base">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--color-brand)]"
              checked={checked[index] ?? false}
              onChange={(event) =>
                setChecked(checked.map((value, i) => (i === index ? event.target.checked : value)))
              }
            />
            <span className={checked[index] ? 'text-text-2 line-through' : 'text-text'}>{item}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
