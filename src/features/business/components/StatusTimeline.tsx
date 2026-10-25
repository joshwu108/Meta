import { Check } from 'lucide-react';
import { cn } from '@/lib/util/cn';
import type { EventStatus, ProposalStatus } from '@/shared/enums';

/**
 * Proposed -> Awaiting your approval -> Approved -> Published (spec section 7, Screen 3).
 * Reads from the proposal status plus the resulting event's status, so the owner can see at
 * a glance which of the two things they are looking at.
 */

const STEPS = ['Proposed', 'Awaiting your approval', 'Approved', 'Published'] as const;

export function StatusTimeline({
  proposalStatus,
  eventStatus,
}: {
  proposalStatus: ProposalStatus;
  eventStatus?: EventStatus | null;
}) {
  const reached = (() => {
    if (eventStatus === 'published' || eventStatus === 'full' || eventStatus === 'completed') return 4;
    if (proposalStatus === 'approved' || proposalStatus === 'modified') return 3;
    if (proposalStatus === 'pending') return 2;
    return 1; // rejected or expired: the proposal was received and stopped there
  })();

  const stopped = proposalStatus === 'rejected' || proposalStatus === 'expired';

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {STEPS.map((step, index) => {
        const done = index + 1 <= reached;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex size-5 items-center justify-center rounded-pill text-xs font-bold',
                done ? 'bg-brand text-text-on-brand' : 'bg-pressed text-text-3',
              )}
            >
              {done ? <Check aria-hidden size={12} strokeWidth={3} /> : index + 1}
            </span>
            <span className={done ? 'font-medium text-text' : 'text-text-3'}>{step}</span>
            {index < STEPS.length - 1 ? <span aria-hidden className="text-text-3">›</span> : null}
          </li>
        );
      })}
      {stopped ? (
        <li className="w-full text-sm font-medium text-danger">
          You {proposalStatus === 'rejected' ? 'rejected' : 'let expire'} this proposal.
        </li>
      ) : null}
    </ol>
  );
}
