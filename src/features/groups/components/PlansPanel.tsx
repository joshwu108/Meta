'use client';
import { Sparkles } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { AiRing, Button, Card, useToast } from '@/features/core/components/ui';
import { useApiAction } from '@/lib/api/use-api-action';
import type { GroupDetail, GroupPlanView } from '../server/types';
import { SuggestionCard } from './SuggestionCard';

const textAreaClass =
  'min-h-20 w-full resize-y rounded-sm border border-divider bg-surface px-3 py-2 text-text placeholder:text-text-3 focus:border-brand focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand';

function consentLine(plan: GroupPlanView | null, activeCount: number): string {
  if (!plan) return `Uses only what members who allow group planning have shared. ${activeCount} active ${activeCount === 1 ? 'member' : 'members'}.`;
  const base = `Based on ${plan.membersIncluded} of ${plan.activeMemberCount} members who allow group planning`;
  const partial = plan.suggestions.some((s) => s.freeCount !== undefined && s.freeCount < plan.membersIncluded);
  return partial ? `${base}. No time works for everyone, so these use the times most of you can make.` : base;
}

function PlannerCard({ group, onPlanned }: { group: GroupDetail; onPlanned: (plan: GroupPlanView) => void }) {
  const { toast } = useToast();
  const { run, isPending } = useApiAction(toast);
  const [request, setRequest] = useState('');
  const fieldId = useId();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = request.trim() || 'Something we would all enjoy';
    const plan = await run<GroupPlanView>('plan', `/api/groups/${group.id}/plan`, { method: 'POST', body: { request: text } }, { success: 'Here are a few ideas' });
    if (plan) onPlanned(plan);
  };
  return (
    <Card as="section" aria-labelledby={`${fieldId}-title`} className="flex flex-col gap-3 sm:p-5">
      <div className="flex items-center gap-3">
        <AiRing>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-pill text-brand">
            <Sparkles size={20} strokeWidth={1.75} aria-hidden />
          </span>
        </AiRing>
        <div className="min-w-0">
          <h2 id={`${fieldId}-title`} className="text-[length:var(--text-xl)] font-bold">
            What should we do?
          </h2>
          <p className="text-[length:var(--text-sm)] text-text-2">{consentLine(group.latestPlan, group.memberCount)}</p>
        </div>
      </div>
      {group.permissions.canPlan ? (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <label htmlFor={fieldId} className="sr-only">
            What should we do?
          </label>
          <textarea id={fieldId} className={textAreaClass} maxLength={500} value={request} onChange={(e) => setRequest(e.target.value)} placeholder="A low-key Thursday night, something creative, under $25…" />
          <div className="flex justify-end">
            <Button type="submit" isLoading={isPending('plan')}>
              Plan something for us
            </Button>
          </div>
        </form>
      ) : (
        <p className="rounded-md bg-surface-2 px-3 py-2 text-[length:var(--text-sm)] text-text-2">In a private group, the owner, admins and the person who started it can ask for a plan. You can still vote.</p>
      )}
    </Card>
  );
}

/** Plans tab (Screen 5): the planner (page lead) and the latest suggestions with votes. */
export function PlansPanel({ group }: { group: GroupDetail }) {
  const { toast } = useToast();
  const { run, isPending } = useApiAction(toast);
  const [plan, setPlan] = useState<GroupPlanView | null>(group.latestPlan);
  const vote = async (index: number) => {
    const next = await run<GroupPlanView>(`vote:${index}`, `/api/groups/${group.id}/plans/${plan!.id}/vote`, { method: 'POST', body: { suggestionIndex: index } }, { refresh: false });
    if (next) setPlan(next);
  };
  const requestVenue = (index: number) =>
    run<{ proposalId: string; businessName?: string }>(
      `venue:${index}`,
      '/api/ai/generate-opportunities',
      { method: 'POST', body: { source: 'group', groupId: group.id, planId: plan!.id, suggestionIndex: index } },
      {
        success: (data) => (data.businessName ? `Sent to ${data.businessName}. They’ll decide whether to host it.` : 'Sent to a local venue. You’ll hear back if they can host it.'),
        refresh: false,
      },
    );
  const venueHint = (current: GroupPlanView) =>
    current.activeMemberCount < current.venueMinMembers ? `Venue requests need at least ${current.venueMinMembers} members` : 'Needs votes from half the group';
  return (
    <div className="flex flex-col gap-3">
      <PlannerCard group={{ ...group, latestPlan: plan }} onPlanned={setPlan} />
      {plan && (
        <section aria-label="Suggestions" className="feed-stagger flex flex-col gap-3">
          {plan.suggestions.map((suggestion, index) => (
            <SuggestionCard
              key={`${plan.id}-${index}`}
              suggestion={suggestion}
              membersIncluded={plan.membersIncluded}
              votes={plan.votes.counts[index] ?? 0}
              votedByMe={plan.votes.mine.includes(index)}
              canVote={group.permissions.canVote}
              venueEligible={plan.venueEligible[index] ?? false}
              venueHint={venueHint(plan)}
              isVoting={isPending(`vote:${index}`)}
              isRequesting={isPending(`venue:${index}`)}
              onVote={() => vote(index)}
              onRequestVenue={() => requestVenue(index)}
            />
          ))}
        </section>
      )}
    </div>
  );
}
