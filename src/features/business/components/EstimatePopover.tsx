'use client';

import { useId, useState } from 'react';
import { Info } from 'lucide-react';

/**
 * Spec section 7, Screen 3 and section 12: the owner must never read the estimate as
 * confirmed demand. The popover says plainly what the number is and is not.
 */
export function EstimatePopover() {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-brand hover:underline"
      >
        <Info aria-hidden size={16} strokeWidth={1.75} />
        What does this estimate mean?
      </button>

      {open ? (
        <div
          id={id}
          role="dialog"
          aria-label="About this estimate"
          className="absolute left-0 top-7 z-20 w-80 rounded-lg bg-surface p-4 text-sm shadow-3"
        >
          <p className="font-semibold">An aggregated, opt-in estimate.</p>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-text-2">
            <li>It counts people nearby who chose to share their interests, as a range.</li>
            <li>It is not a list of attendees and nobody has committed to come.</li>
            <li>We never show you who they are, and never a precise number.</li>
            <li>RSVPs only start once you publish the event.</li>
          </ul>
        </div>
      ) : null}
    </span>
  );
}
