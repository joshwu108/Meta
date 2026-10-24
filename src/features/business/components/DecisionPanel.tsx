'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, Card, CardHeader, Field, Select, Textarea } from '@/features/core/components/ui';
import { ApiClientError, apiPatch, fieldErrors } from '@/lib/api/client';
import type { BusinessEvent, ProposalDetail } from '@/shared/types';
import { REJECTION_REASONS, type RejectionReason } from '../schemas';
import { EventFieldset, type EventDraft } from './EventFieldset';
import {
  REASON_LABEL,
  approveBody,
  initialEventDraft,
  modifyBody,
  rejectBody,
  type DecisionMode,
} from './decision/decision';

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
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<DecisionMode>('idle');
  const [publishNow, setPublishNow] = useState(true);
  const [reason, setReason] = useState<RejectionReason>('wrong_time');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [draft, setDraft] = useState<EventDraft>(() =>
    initialEventDraft(proposal.proposal, suggestedStartsAt),
  );

  const decided = proposal.status !== 'pending';

  const submit = (body: Record<string, unknown>) => {
    setMessage(null);
    setErrors({});
    startTransition(async () => {
      try {
        const result = await apiPatch<{ proposal: ProposalDetail; event: BusinessEvent | null }>(
          `/api/business/proposals/${proposal.id}`,
          body,
        );
        if (result.event && result.event.status === 'published') {
          router.push('/business/events');
          return;
        }
        router.refresh();
      } catch (err) {
        if (err instanceof ApiClientError) {
          setMessage(err.message);
          setErrors(fieldErrors(err.details));
          return;
        }
        setMessage('Something went wrong. Please try again.');
      }
    });
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

      {mode === 'rejecting' ? (
        <div className="flex flex-col gap-4">
          <Field label="Reason" htmlFor="reject-reason">
            <Select
              id="reject-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value as RejectionReason)}
            >
              {REJECTION_REASONS.map((value) => (
                <option key={value} value={value}>
                  {REASON_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note (optional)" htmlFor="reject-note" hint="Only you and our team see this.">
            <Textarea
              id="reject-note"
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
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
