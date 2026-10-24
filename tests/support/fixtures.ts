import type { NotificationType } from '@/shared/enums';
import type { ProposalDocument } from '@/shared/types';
import { makeDeps, type BusinessDeps } from '@/features/business/server/deps';
import type { MemoryBusinessStore } from './memory-store';

export const PROPOSAL_FIXTURE: ProposalDocument = {
  title: 'Beginner Pottery & Coffee Night',
  description:
    'A guided wheel-throwing session for complete beginners, followed by coffee and easy conversation.',
  category: 'creative',
  format: 'Guided 60-min beginner session, then 45 min open conversation',
  intendedSocialExperience: 'Low-pressure, hands busy, easy conversation',
  suggestedSlot: 'thu_eve',
  suggestedStartTimeLocal: '18:00',
  estimatedDurationMinutes: 105,
  suggestedCapacity: 8,
  suggestedPriceCents: 2000,
  priceRangeCents: { min: 1500, max: 3500 },
  demand: { band: '6-9', neighborhoodLabel: 'Mission', topInterests: ['pottery', 'coffee'] },
  whySuggested: 'Several people nearby are interested in creative activities on Thursday evenings.',
  assumptionsToValidate: ['Studio has 8 wheels', 'Staff available Thursday 6-8pm'],
  disclaimers: ['demand_is_estimate'],
  suggestedStartsAt: '2026-11-05T18:00:00.000Z',
};

export type RecordedNotification = {
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
};

export type TestDeps = BusinessDeps & {
  notifications: RecordedNotification[];
  actions: { userId: string; action: string; result: string }[];
};

/** Deps wired to the in-memory store, with every notification and action recorded. */
export function testDeps(store: MemoryBusinessStore, now = new Date('2026-10-26T12:00:00Z')): TestDeps {
  const notifications: RecordedNotification[] = [];
  const actions: { userId: string; action: string; result: string }[] = [];

  const deps = makeDeps({
    store,
    now: () => now,
    timezone: 'UTC',
    notify: async (userId, type, payload) => {
      notifications.push({ userId, type, payload });
    },
    logAgentAction: async ({ userId, action, result }) => {
      actions.push({ userId, action, result });
    },
  });

  return { ...deps, notifications, actions };
}

export const PENDING_PROPOSAL = (businessId: string, clusterId: string | null = 'cluster-1') => ({
  business_id: businessId,
  cluster_id: clusterId,
  status: 'pending' as const,
  proposal: PROPOSAL_FIXTURE,
  business_edits: null,
  decision_note: null,
  decided_at: null,
  resulting_event_id: null,
  expires_at: '2026-11-09T00:00:00.000Z',
  created_at: '2026-10-26T09:00:00.000Z',
});
