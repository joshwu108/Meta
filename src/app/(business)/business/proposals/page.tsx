import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/features/core/components/ui';
import { cn } from '@/lib/util/cn';
import { ProposalCard } from '@/features/business/components/ProposalCard';
import { listBusinessProposals } from '@/features/business/server/proposals';
import { requireBusinessPage } from '@/features/business/server/page-data';
import { PROPOSAL_STATUS, type ProposalStatus } from '@/shared/enums';

export const dynamic = 'force-dynamic';

const FILTERS = [
  { label: 'Pending', status: 'pending' as ProposalStatus },
  { label: 'Decided', status: undefined },
] as const;

/** Business Screen 3 (list) — the proposal inbox. */
export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { deps, business } = await requireBusinessPage();
  const requested = (await searchParams).status;
  const status = PROPOSAL_STATUS.includes(requested as ProposalStatus)
    ? (requested as ProposalStatus)
    : 'pending';

  const [proposals] = await Promise.all([
    listBusinessProposals(deps, business.id, requested === 'all' ? undefined : status),
    listBusinessProposals(deps, business.id, 'pending'),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-bold leading-tight">Proposals</h1>
        <p className="mt-1 max-w-prose text-sm text-text-2">
          Events suggested from opt-in community interest near you. Nothing is published until you
          approve the final details.
        </p>
      </header>

      <div role="tablist" aria-label="Proposal filter" className="flex gap-1 border-b border-divider">
        {FILTERS.map((filter) => {
          const href = filter.status ? '/business/proposals' : '/business/proposals?status=all';
          const active = filter.status ? requested !== 'all' : requested === 'all';
          return (
            <Link
              key={filter.label}
              role="tab"
              aria-selected={active}
              href={href}
              className={cn(
                '-mb-px border-b-[3px] px-3 pb-2 text-base font-semibold',
                active ? 'border-brand text-brand' : 'border-transparent text-text-2 hover:text-text',
              )}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      {proposals.length === 0 ? (
        <EmptyState icon={<Sparkles aria-hidden size={24} strokeWidth={1.75} />} title="Nothing here yet. Proposals arrive when enough people nearby show interest in something you could host." />
      ) : (
        <div className="flex flex-col gap-3">
          {proposals.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} />
          ))}
        </div>
      )}
    </div>
  );
}
