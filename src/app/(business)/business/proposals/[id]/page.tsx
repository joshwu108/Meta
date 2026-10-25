import { notFound } from 'next/navigation';
import { AiTag, Card, CardHeader } from '@/features/core/components/ui';
import { ApiError } from '@/lib/api/errors';
import { AssumptionsChecklist } from '@/features/business/components/AssumptionsChecklist';
import { DecisionPanel } from '@/features/business/components/DecisionPanel';
import { EstimatePopover } from '@/features/business/components/EstimatePopover';
import { StatusTimeline } from '@/features/business/components/StatusTimeline';
import { formatDateTime, formatPrice, formatPriceRange } from '@/features/business/format';
import { CATEGORY_LABEL, SLOT_LABEL, demandSentence } from '@/features/business/labels';
import { getBusinessProposal } from '@/features/business/server/proposals';
import { getBusinessEvent } from '@/features/business/server/events';
import { requireBusinessPage } from '@/features/business/server/page-data';
import { nextSlotOccurrence } from '@/features/business/server/time';
import { isLookupId } from '@/features/business/server/lookup-id';

export const dynamic = 'force-dynamic';

/** Business Screen 3 — proposal detail and decision. */
export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { deps, business } = await requireBusinessPage();
  const { id } = await params;
  if (!isLookupId(id)) notFound();

  const proposal = await getBusinessProposal(deps, business.id, id).catch((err: unknown) => {
    if (err instanceof ApiError && err.code === 'NOT_FOUND') notFound();
    throw err;
  });

  const resultingEvent = proposal.resultingEventId
    ? await getBusinessEvent(deps, business.id, proposal.resultingEventId)
    : null;

  const document = proposal.proposal;
  const startsAt =
    proposal.suggestedStartsAt ??
    nextSlotOccurrence(document.suggestedSlot, document.suggestedStartTimeLocal, {
      from: deps.now(),
      timezone: deps.timezone,
    }).toISOString();

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <StatusTimeline proposalStatus={proposal.status} eventStatus={resultingEvent?.status ?? null} />
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-5">
          {/* The lead element: the suggestion itself. */}
          <Card className="flex flex-col gap-4">
            <div>
              <AiTag label="AI suggestion" />
              <h1 className="mt-2 text-2xl font-bold leading-tight">{document.title}</h1>
              <p className="mt-1 text-sm text-text-2">
                {CATEGORY_LABEL[document.category]} · {SLOT_LABEL[document.suggestedSlot]} ·{' '}
                {formatDateTime(startsAt)} · {document.estimatedDurationMinutes} min
              </p>
            </div>

            <p className="text-base leading-relaxed">{document.description}</p>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-4 text-sm sm:grid-cols-4">
              {[
                { label: 'Format', value: document.format },
                { label: 'Capacity', value: String(document.suggestedCapacity) },
                { label: 'Price', value: formatPrice(document.suggestedPriceCents) },
                {
                  label: 'Range',
                  value: formatPriceRange(
                    document.priceRangeCents?.min ?? null,
                    document.priceRangeCents?.max ?? null,
                  ),
                },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-text-2">{item.label}</dt>
                  <dd className="mt-0.5 font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <h2 className="text-sm font-semibold text-text-2">The social experience</h2>
              <p className="mt-1 text-base">{document.intendedSocialExperience}</p>
            </div>

            <div className="rounded-md bg-surface-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <AiTag label="Estimate" />
              </div>
              <p className="mt-2 text-base">
                {demandSentence(proposal.demand.band, document.category, document.suggestedSlot)}.
              </p>
              <p className="mt-1 text-sm text-text-2">
                These are not RSVPs and nobody has committed to come.
              </p>
              <div className="mt-2">
                <EstimatePopover />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Why this was suggested" />
            <p className="text-base leading-relaxed">{document.whySuggested}</p>
            {proposal.demand.topInterests.length > 0 ? (
              <p className="mt-3 text-sm text-text-2">
                Shared interests nearby: {proposal.demand.topInterests.join(', ')}
              </p>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="Assumptions to confirm"
              subtitle="Only you can check these. Ticking them changes nothing."
            />
            <AssumptionsChecklist items={document.assumptionsToValidate} />
          </Card>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <DecisionPanel
            proposal={proposal}
            capacityCeiling={business.capabilities.capacity}
            suggestedStartsAt={startsAt}
          />
        </div>
      </div>
    </div>
  );
}
