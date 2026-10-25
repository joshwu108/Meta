import { describe, expect, it } from 'vitest';
import { proposalDecisionSchema } from '@/features/business/schemas';
import {
  REASON_LABEL,
  approveBody,
  initialEventDraft,
  modifyBody,
  rejectBody,
} from '@/features/business/components/decision/decision';
import { REJECTION_REASONS } from '@/features/business/schemas';
import { PROPOSAL_FIXTURE } from '../../support/fixtures';

/**
 * The decision panel's payload is what makes Scene 4 work, so it is pinned here against
 * the same Zod schema the route parses.
 */
describe('decision payloads', () => {
  const startsAt = '2026-11-05T18:00:00.000Z';

  it('starts the editor from the proposal own suggestion', () => {
    const draft = initialEventDraft(PROPOSAL_FIXTURE, startsAt);
    expect(draft.title).toBe(PROPOSAL_FIXTURE.title);
    expect(draft.capacity).toBe(8);
    expect(draft.priceDollars).toBe('20');
    expect(draft.category).toBe('creative');
  });

  it('derives the end time from the estimated duration', () => {
    const draft = initialEventDraft(PROPOSAL_FIXTURE, startsAt);
    const minutes =
      (new Date(draft.endsAtLocal).getTime() - new Date(draft.startsAtLocal).getTime()) / 60_000;
    expect(minutes).toBe(PROPOSAL_FIXTURE.estimatedDurationMinutes);
  });

  it('shows a free proposal as an empty price rather than zero', () => {
    const draft = initialEventDraft({ ...PROPOSAL_FIXTURE, suggestedPriceCents: null }, startsAt);
    expect(draft.priceDollars).toBe('');
  });

  it('approve-as-is sends only the decision and the publish choice', () => {
    expect(approveBody(true)).toEqual({ decision: 'approve', publish: true });
    expect(proposalDecisionSchema.safeParse(approveBody(false)).success).toBe(true);
  });

  it('edit & approve sends the edits the route expects', () => {
    const draft = { ...initialEventDraft(PROPOSAL_FIXTURE, startsAt), priceDollars: '25', capacity: 10 };
    const body = modifyBody(draft, true);

    expect(body.decision).toBe('modify');
    expect(body.publish).toBe(true);
    expect(body.edits.priceCents).toBe(2500);
    expect(body.edits.capacity).toBe(10);
    expect(proposalDecisionSchema.safeParse(body).success).toBe(true);
  });

  it('sends a null price when the owner clears it', () => {
    const draft = { ...initialEventDraft(PROPOSAL_FIXTURE, startsAt), priceDollars: '' };
    expect(modifyBody(draft, false).edits.priceCents).toBeNull();
  });

  it('a rejection always carries a reason and drops an empty note', () => {
    expect(rejectBody('staffing', '   ')).toEqual({ decision: 'reject', reason: 'staffing' });
    expect(rejectBody('staffing', ' no second potter ')).toEqual({
      decision: 'reject',
      reason: 'staffing',
      note: 'no second potter',
    });
    expect(proposalDecisionSchema.safeParse(rejectBody('other', '')).success).toBe(true);
  });

  it('has copy for every rejection reason the schema allows', () => {
    expect(Object.keys(REASON_LABEL).sort()).toEqual([...REJECTION_REASONS].sort());
  });

  it('the schema refuses a modify with no edits and a reject with no reason', () => {
    expect(proposalDecisionSchema.safeParse({ decision: 'modify' }).success).toBe(false);
    expect(proposalDecisionSchema.safeParse({ decision: 'reject' }).success).toBe(false);
  });
});
