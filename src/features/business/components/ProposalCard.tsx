import { Clock } from 'lucide-react';
import { AiTag, ButtonLink, Card, StatusPill } from '@/features/core/components/ui';
import type { ProposalSummary } from '@/shared/types';
import { CATEGORY_LABEL, SLOT_LABEL, demandSentence } from '../labels';
import { formatDateTime } from '../format';

/**
 * One row of the proposal inbox. Carries the gradient `AiTag` so the owner can never
 * mistake a suggestion for a confirmed event, and the banded estimate sentence — never a
 * raw number (spec sections 7 and 12).
 */
export function ProposalCard({ proposal }: { proposal: ProposalSummary }) {
  return (
    <Card interactive className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <AiTag label="AI suggestion" />
            <StatusPill tone={proposal.status === 'pending' ? 'warning' : 'neutral'}>
              {proposal.status === 'pending' ? 'Awaiting your approval' : proposal.status}
            </StatusPill>
          </div>
          <h3 className="mt-2 text-md font-semibold leading-tight">{proposal.title}</h3>
          <p className="mt-1 text-sm text-text-2">
            {CATEGORY_LABEL[proposal.category]} · {SLOT_LABEL[proposal.suggestedSlot]}
            {proposal.suggestedStartsAt ? ` · ${formatDateTime(proposal.suggestedStartsAt)}` : ''}
          </p>
        </div>
        <ButtonLink href={`/business/proposals/${proposal.id}`} className="shrink-0">
          Review
        </ButtonLink>
      </div>

      <p className="flex items-start gap-2 rounded-sm bg-surface-2 px-3 py-2 text-sm text-text-2">
        <Clock aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
        <span>
          {demandSentence(proposal.demand.band, proposal.category, proposal.suggestedSlot)}.{' '}
          <span className="font-medium text-text">This is an estimate, not RSVPs.</span>
        </span>
      </p>
    </Card>
  );
}
