import type { NotificationType } from '@/shared/enums';
import type { BusinessMatch, VenueCriteria } from '@/shared/types';
import type { DemandBrief, ProposalDocument, RunStage, RunStats, StoredProposal } from '../schemas';
import type { AggregatedCluster } from './aggregate';
import type { DemandUser } from './categories';
import type { DemandConfig } from './config';
import type { CapabilitySummary, Venue } from './venue';

export type TriggeredBy = 'manual' | 'cron' | 'group';

export type ActionLogEntry = {
  userId: string | null;
  actor: 'demand_engine' | 'planning_agent';
  action: string;
  permissionsUsed: string[];
  result: string;
};

export type GenerateInput = {
  brief: DemandBrief;
  business: Venue['card'];
  capabilities: CapabilitySummary;
  /** Set for group-originated proposals: the idea the group voted for (03's suggestion). */
  groupIdea?: { title: string; description: string };
  feedback?: string;
};

export type RunUpdate = { status?: 'running' | 'completed' | 'failed'; stage?: RunStage; stats?: RunStats; error?: string; finished?: boolean };

/** Everything the pipeline touches outside pure code. Production wiring lives in `wiring.ts`. */
export type PipelineDeps = {
  config: DemandConfig;
  now: () => Date;
  /** Creates a running run and takes the pipeline lock; null when another run is in progress. */
  startRun: (triggeredBy: TriggeredBy) => Promise<string | null>;
  listEligibleUserIds: () => Promise<string[]>;
  getSharableBatch: (userIds: readonly string[]) => Promise<ReadonlyMap<string, DemandUser>>;
  logActions: (entries: readonly ActionLogEntry[]) => Promise<void>;
  findCandidates: (criteria: VenueCriteria) => Promise<BusinessMatch[]>;
  loadVenue: (match: BusinessMatch) => Promise<Venue | null>;
  hasRecentPendingProposal: (signature: string, since: Date) => Promise<boolean>;
  generate: (input: GenerateInput) => Promise<ProposalDocument>;
  updateRun: (runId: string, update: RunUpdate) => Promise<void>;
  saveProposal: (input: { runId: string; cluster: AggregatedCluster; venue: Venue; proposal: StoredProposal }) => Promise<string>;
  notify: (userId: string, type: NotificationType, payload: Record<string, unknown>) => Promise<void>;
};
