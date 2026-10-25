'use client';

import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AVAILABILITY_SLOT } from '@/shared/enums';
import { Button, Card, CardHeader, Input } from '@/features/core/components/ui';
import { Select, Textarea } from './form';
import { ApiClientError, apiPatch, apiPost } from '@/lib/api/client';
import type { BusinessEvent, ProposalDetail } from '@/shared/types';
import { SLOT_LABEL } from '../labels';
import { REJECTION_REASONS, type RejectionReason } from '../schemas';
import { EventFieldset, type EventDraft } from './EventFieldset';
import { REASON_LABEL, approveBody, initialEventDraft, modifyBody, rejectBody, type DecisionMode } from './decision/decision';
import { useSubmit } from './use-submit';
import {
  EMPTY_REVISE_FORM,
  canRevise,
  reviseBody,
  reviseErrorMessage,
  type ReviseForm,
  type ReviseResponse,
} from './decision/revise';

/**
 * Business Screen 3, decision panel (spec section 7): Approve as-is, Edit & approve, or
 * Reject with a reason. "Publish now" or "Save as draft" decides what happens after the
 * approval. The server owns the status machine; this panel only sends the decision.
 */

export function DecisionPanel({
  proposal,
  capacityCeiling,
  suggestedStartsAt,
}: {
  proposal: ProposalDetail;
  capacityCeiling: number;
  suggestedStartsAt: string;
}) {
  const router = useRouter();
  const { busy: pending, message, errors, submit: run, navigate } = useSubmit();
  const [mode, setMode] = useState<DecisionMode>('idle');
  const [publishNow, setPublishNow] = useState(true);
  const [reason, setReason] = useState<RejectionReason>('wrong_time');
  const [note, setNote] = useState('');
  const [revise, setRevise] = useState<ReviseForm>(EMPTY_REVISE_FORM);
  const [reviseError, setReviseError] = useState<string | null>(null);

  const [draft, setDraft] = useState<EventDraft>(() =>
    initialEventDraft(proposal.proposal, suggestedStartsAt),
  );

  const decided = proposal.status !== 'pending';

  const submit = (body: Record<string, unknown>) => {
    let published = false;
    return run(
      async () => {
        const result = await apiPatch<{ proposal: ProposalDetail; event: BusinessEvent | null }>(
          `/api/business/proposals/${proposal.id}`,
          body,
        );
        published = result.event?.status === 'published';
      },
      // A published event is live, so show it in the events list; a draft or a rejection
      // stays here and the page re-reads the decided proposal.
      () => (published ? navigate('/business/events') : router.refresh()),
    );
  };

  /**
   * Workstream 04 answers with a **new** pending proposal that supersedes this one, so the
   * owner is sent to that proposal rather than left on an expired page.
   */
  const askForRevision = async () => {
    setReviseError(null);
    try {
      const result = await apiPost<ReviseResponse>(
        `/api/ai/proposals/${proposal.id}/revise`,
        reviseBody(revise),
      );
      navigate(`/business/proposals/${result.proposalId}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setReviseError(reviseErrorMessage(err.code, err.message));
        return;
      }
      setReviseError('Something went wrong. Please try again.');
    }
  };

  const approveAsIs = () => submit(approveBody(publishNow));
  const approveWithEdits = () => submit(modifyBody(draft, publishNow));
  const reject = () => submit(rejectBody(reason, note));

  if (decided) {
    return (
      <Card>
        <CardHeader
          title="Decided"
          subtitle={`You ${proposal.status} this proposal${
            proposal.decidedAt ? ` on ${new Date(proposal.decidedAt).toLocaleDateString()}` : ''
          }.`}
        />
        {proposal.resultingEventId ? (
          <a
            className="text-base font-semibold text-brand hover:underline"
            href={`/business/events/${proposal.resultingEventId}/edit`}
          >
            Open the event
          </a>
        ) : null}
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader
        title="Your decision"
        subtitle="Nothing is visible to anyone until you publish it."
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">When approved</legend>
        <div className="flex gap-2">
          {[
            { value: true, label: 'Publish now' },
            { value: false, label: 'Save as draft' },
          ].map((option) => (
            <label
              key={option.label}
              className={`flex-1 cursor-pointer rounded-md px-3 py-2 text-center text-sm font-semibold ${
                publishNow === option.value ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-text-2'
              }`}
            >
              <input
                type="radio"
                name="publish-mode"
                className="sr-only"
                checked={publishNow === option.value}
                onChange={() => setPublishNow(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      {message ? (
        <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">
          {message}
        </p>
      ) : null}

      {mode === 'idle' ? (
        <div className="flex flex-col gap-2">
          <Button onClick={approveAsIs} disabled={pending}>
            Approve as-is
          </Button>
          <Button variant="secondary" onClick={() => setMode('editing')} disabled={pending}>
            Edit &amp; approve
          </Button>
          <Button variant="secondary" onClick={() => setMode('revising')} disabled={pending}>
            <Sparkles aria-hidden size={16} strokeWidth={1.75} />
            Ask AI to revise
          </Button>
          <Button variant="ghost" onClick={() => setMode('rejecting')} disabled={pending}>
            Reject
          </Button>
        </div>
      ) : null}

      {mode === 'editing' ? (
        <div className="flex flex-col gap-4">
          <EventFieldset
            draft={draft}
            onChange={setDraft}
            errors={errors}
            lockCategory
            capacityCeiling={capacityCeiling}
          />
          <div className="flex flex-col gap-2">
            <Button onClick={approveWithEdits} disabled={pending}>
              {publishNow ? 'Approve & publish' : 'Approve as draft'}
            </Button>
            <Button variant="ghost" onClick={() => setMode('idle')} disabled={pending}>
              Back
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'revising' ? (
        <div className="flex flex-col gap-4">
          <p className="text-[length:var(--text-sm)] text-text-2">
            Say what you would change and the AI rewrites the whole proposal. You get a new
            suggestion to review; nothing is published.
          </p>

          {reviseError ? (
            <p role="alert" className="rounded-sm bg-danger-soft px-3 py-2 text-[length:var(--text-sm)] text-danger">
              {reviseError}
            </p>
          ) : null}

          <Textarea
            id="revise-note"
            label="What should change?"
            hint="For example: make it shorter, or aim it at complete beginners."
            value={revise.note}
            maxLength={500}
            onChange={(event) => setRevise({ ...revise, note: event.target.value })}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="revise-price"
              label="Price"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.5"
              hint="Leave empty to keep it."
              value={revise.priceDollars}
              onChange={(event) => setRevise({ ...revise, priceDollars: event.target.value })}
            />
            <Input
              id="revise-capacity"
              label="Capacity"
              type="number"
              inputMode="numeric"
              min={4}
              max={capacityCeiling}
              hint="Leave empty to keep it."
              value={revise.capacity}
              onChange={(event) => setRevise({ ...revise, capacity: event.target.value })}
            />
          </div>

          <Select
            id="revise-slot"
            label="When"
            value={revise.slot}
            onChange={(event) => setRevise({ ...revise, slot: event.target.value as ReviseForm['slot'] })}
          >
            <option value="">Keep the suggested time</option>
            {AVAILABILITY_SLOT.map((slot) => (
              <option key={slot} value={slot}>
                {SLOT_LABEL[slot]}
              </option>
            ))}
          </Select>

          <div className="flex flex-col gap-2">
            <Button onClick={askForRevision} disabled={pending || !canRevise(revise)}>
              Ask for a new version
            </Button>
            <Button variant="ghost" onClick={() => setMode('idle')} disabled={pending}>
              Back
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'rejecting' ? (
        <div className="flex flex-col gap-4">
          <Select label="Reason" id="reject-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value as RejectionReason)}
            >
              {REJECTION_REASONS.map((value) => (
                <option key={value} value={value}>
                  {REASON_LABEL[value]}
                </option>
              ))}
            </Select>
          <Textarea label="Note (optional)" hint="Only you and our team see this." id="reject-note"
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)} />
          <div className="flex flex-col gap-2">
            <Button variant="danger" onClick={reject} disabled={pending}>
              Reject proposal
            </Button>
            <Button variant="ghost" onClick={() => setMode('idle')} disabled={pending}>
              Back
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
